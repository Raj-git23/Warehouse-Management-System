import csv
import os
import asyncio
from datetime import datetime, date
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import asyncpg

from app.controllers.jobs import update_job
from app.database import engine


# --------------- Configuration ---------------
BATCH_SIZE = 100_000  # rows per batch
MAX_WORKERS = 8       # concurrent async workers for batch inserts
TASK_TIMEOUT = 600    # 10 minutes max processing time


# --------------- Helper functions ---------------
def parse_date(date_str: str) -> date:
    """Parses date string in YYYY-MM-DD format."""
    return datetime.strptime(date_str.strip(), "%Y-%m-%d").date()


def count_lines(filepath: str) -> int:
    """Fast line count of a file. Runs in executor thread.
    Subtracts 1 for the header row.
    """
    count = 0
    with open(filepath, "rb") as f:
        for _ in f:
            count += 1
    # Subtract header row, minimum 0
    return max(count - 1, 0)


async def insert_batch(conn: asyncpg.Connection, records: list) -> int:
    """Inserts a batch of records into database using a temporary table and COPY.
    Handles duplicates with ON CONFLICT DO NOTHING.
    """
    async with conn.transaction():
        # Create a temp table that will automatically drop on commit
        await conn.execute(
            """CREATE TEMP TABLE temp_products (
                wid VARCHAR,
                ean VARCHAR,
                manufacturing_date DATE,
                expiry_date DATE
            ) ON COMMIT DROP;"""
        )
        
        # Use COPY command via copy_records_to_table for high performance
        await conn.copy_records_to_table(
            "temp_products",
            records=records,
            columns=["wid", "ean", "manufacturing_date", "expiry_date"]
        )
        
        # Perform ON CONFLICT DO NOTHING insert
        # Return count of inserted rows
        result = await conn.fetchrow("""
            WITH inserted AS (
                INSERT INTO products (wid, ean, manufacturing_date, expiry_date)
                SELECT wid, ean, manufacturing_date, expiry_date FROM temp_products
                ON CONFLICT (wid) DO NOTHING
                RETURNING 1
            )
            SELECT count(*) FROM inserted;
        """)
        
        return result[0] if result else 0


def _parse_csv_rows_from_file(filepath: str):
    """
    Synchronous generator that reads a CSV file from disk
    and yields parsed tuples of (wid, ean, mfg_date, exp_date).
    Yields None for skipped/invalid rows.
    
    NOTE: This is a true generator — it never loads all rows into memory.
    """
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        
        # Parse header
        header = None
        for row in reader:
            if row:
                header = [col.strip().lower() for col in row]
                break
        
        if not header:
            return
        
        required = {"wid", "ean", "manufacturing_date", "expiry_date"}
        if not required.issubset(set(header)):
            raise ValueError(
                f"Invalid CSV header. Expected columns WID, EAN, Manufacturing_Date, Expiry_Date. Found: {header}"
            )
        
        wid_idx = header.index("wid")
        ean_idx = header.index("ean")
        mfg_idx = header.index("manufacturing_date")
        exp_idx = header.index("expiry_date")
        max_idx = max(wid_idx, ean_idx, mfg_idx, exp_idx)
        
        for row in reader:
            if not row or len(row) <= max_idx:
                yield None  # Signal a skipped row
                continue
            
            wid = row[wid_idx].strip()
            ean = row[ean_idx].strip()
            mfg_str = row[mfg_idx].strip()
            exp_str = row[exp_idx].strip()
            
            if not wid or not ean or not mfg_str or not exp_str:
                yield None
                continue
            
            try:
                mfg_date = parse_date(mfg_str)
                exp_date = parse_date(exp_str)
                yield (wid, ean, mfg_date, exp_date)
            except ValueError:
                yield None


# --------------- Concurrent worker ---------------

async def _worker_insert_batch(
    batch_records: list,
    job_id: str,
    semaphore: asyncio.Semaphore,
    progress_lock: asyncio.Lock,
    counters: dict,
):
    """A single async worker that inserts one batch into the DB.
    Gets its own raw asyncpg connection from the engine pool.
    """
    async with semaphore:
        try:
            # Get a connection from the SQLAlchemy engine pool
            async with engine.connect() as sa_conn:
                raw_conn = await sa_conn.get_raw_connection()
                asyncpg_conn = raw_conn.driver_connection

                inserted_in_batch = await insert_batch(asyncpg_conn, batch_records)
                skipped_in_batch = len(batch_records) - inserted_in_batch

                # Update shared counters thread-safely
                async with progress_lock:
                    counters["inserted"] += inserted_in_batch
                    counters["skipped"] += skipped_in_batch
                    counters["processed_rows"] += len(batch_records)

                # Update job progress (outside the counter lock to avoid holding it)
                await update_job(
                    job_id,
                    inserted=counters["inserted"],
                    skipped=counters["skipped"],
                    processed_rows=counters["processed_rows"],
                )
        except Exception as e:
            print(f"Batch insert error: {e}")
            # On batch failure: count all records as skipped, don't crash the whole job
            async with progress_lock:
                counters["skipped"] += len(batch_records)
                counters["processed_rows"] += len(batch_records)
                counters["errors"].append(str(e))

            await update_job(
                job_id,
                skipped=counters["skipped"],
                processed_rows=counters["processed_rows"],
            )


# -------- Background processing function --------

async def _process_csv_inner(filepath: str, job_id: str):
    """
    Inner processing function (called with timeout wrapper).
    Streams CSV, chunks into BATCH_SIZE batches, and dispatches
    to MAX_WORKERS concurrent async workers for parallel DB inserts.
    """
    loop = asyncio.get_event_loop()

    # Phase 1: Fast line count for total_rows (runs in thread, pure I/O)
    total_rows = await loop.run_in_executor(None, count_lines, filepath)
    await update_job(job_id, status="processing", total_rows=total_rows)

    # Phase 2: Stream CSV and dispatch batches to workers
    semaphore = asyncio.Semaphore(MAX_WORKERS)
    progress_lock = asyncio.Lock()
    counters = {
        "inserted": 0,
        "skipped": 0,
        "processed_rows": 0,
        "errors": [],
    }

    # We'll collect worker tasks and await them
    worker_tasks = []
    batch_records = []
    parse_skipped = 0

    # Run the synchronous CSV generator in a thread and iterate over chunks
    # We read chunks from the generator in an executor to avoid blocking the event loop
    all_rows = await loop.run_in_executor(
        None, lambda: list(_chunked_csv_reader(filepath, BATCH_SIZE))
    )

    for chunk_type, chunk_data in all_rows:
        if chunk_type == "skipped":
            parse_skipped += chunk_data  # chunk_data is count of skipped rows

            # Update skipped count in counters
            async with progress_lock:
                counters["skipped"] += chunk_data
                counters["processed_rows"] += chunk_data
            await update_job(
                job_id,
                skipped=counters["skipped"],
                processed_rows=counters["processed_rows"],
            )
        elif chunk_type == "batch":
            # chunk_data is a list of valid record tuples
            task = asyncio.create_task(
                _worker_insert_batch(
                    chunk_data, job_id, semaphore, progress_lock, counters
                )
            )
            worker_tasks.append(task)

    # Wait for all workers to finish
    if worker_tasks:
        await asyncio.gather(*worker_tasks, return_exceptions=True)

    # Final state
    has_errors = len(counters["errors"]) > 0
    error_summary = "; ".join(counters["errors"][:5]) if has_errors else None

    # If we had errors and nothing was inserted, mark the whole job as failed
    final_status = "failed" if (has_errors and counters["inserted"] == 0) else "completed"

    await update_job(
        job_id,
        status=final_status,
        total_rows=total_rows,
        processed_rows=counters["processed_rows"],
        inserted=counters["inserted"],
        skipped=counters["skipped"],
        error=error_summary,
    )


def _chunked_csv_reader(filepath: str, chunk_size: int):
    """
    Synchronous function that reads a CSV file and yields chunks.
    Each yield is either:
      ("batch", [list of record tuples])  — a full batch of valid rows
      ("skipped", count)                  — number of skipped rows in this chunk
    
    This runs in a thread via run_in_executor. It produces a list
    of (type, data) tuples that the async caller iterates over.
    
    Memory: only one chunk_size batch is in memory at a time during generation,
    but list() collects all chunks. For 10M rows / 100K chunk = ~100 chunks.
    Each chunk reference is small after the worker consumes it.
    """
    batch = []
    skipped_count = 0

    for record in _parse_csv_rows_from_file(filepath):
        if record is None:
            skipped_count += 1
        else:
            batch.append(record)

        if len(batch) >= chunk_size:
            # Yield any accumulated skipped count first
            if skipped_count > 0:
                yield ("skipped", skipped_count)
                skipped_count = 0
            yield ("batch", batch)
            batch = []

    # Flush remaining
    if skipped_count > 0:
        yield ("skipped", skipped_count)
    if batch:
        yield ("batch", batch)


async def process_csv_from_file(filepath: str, job_id: str):
    """
    Background task entry point. Wraps the inner processing with:
    - Timeout protection (TASK_TIMEOUT seconds)
    - Error handling → marks job as failed
    - File cleanup → always deletes the temp file
    """
    try:
        await update_job(job_id, status="processing")

        # Wrap with timeout
        await asyncio.wait_for(
            _process_csv_inner(filepath, job_id),
            timeout=TASK_TIMEOUT,
        )

    except asyncio.TimeoutError:
        await update_job(
            job_id,
            status="failed",
            error=f"Processing timed out after {TASK_TIMEOUT // 60} minutes.",
        )
    except Exception as e:
        await update_job(
            job_id,
            status="failed",
            error=str(e),
        )
    finally:
        # Clean up the temp file from disk
        try:
            os.remove(filepath)
        except OSError:
            pass


# -------- Legacy synchronous upload (kept for reference) --------

async def csv_row_generator(file: UploadFile):
    """Async generator that reads the uploaded file in chunks and yields CSV rows."""
    chunk_size = 1024 * 1024  # 1MB chunk
    buffer = ""
    
    await file.seek(0)
    
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
            
        text = chunk.decode("utf-8", errors="replace")
        buffer += text
        
        lines = buffer.splitlines(keepends=True)
        if not lines:
            continue
            
        if not text.endswith(("\n", "\r")):
            buffer = lines.pop()
        else:
            buffer = ""
            
        for line in lines:
            reader = csv.reader([line.strip()])
            for row in reader:
                if row:
                    yield row
                    
    if buffer:
        reader = csv.reader([buffer.strip()])
        for row in reader:
            if row:
                yield row


async def process_csv_upload(file: UploadFile, db: AsyncSession):
    """
    Stream-parses CSV product data and bulk inserts into the products table
    in batches of 5000 using asyncpg's copy_records_to_table.
    Handles duplicate WIDs gracefully with ON CONFLICT DO NOTHING.
    
    NOTE: This is the LEGACY synchronous path kept for small files.
    For large files, use process_csv_from_file() as a background task.
    """

    if file.size == 0:
        raise HTTPException(400, "Uploaded file is empty.")

    total_rows = 0
    inserted = 0
    skipped = 0
    
    header = None
    wid_idx = -1
    ean_idx = -1
    mfg_idx = -1
    exp_idx = -1
    
    batch_size = 5000
    batch_records = []
    
    conn = await db.connection()
    raw_conn = await conn.get_raw_connection()
    asyncpg_conn = raw_conn.driver_connection
    
    async for row in csv_row_generator(file):
        if header is None:
            header = [col.strip().lower() for col in row]
            required = {"wid", "ean", "manufacturing_date", "expiry_date"}
            if not required.issubset(set(header)):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid CSV header. Expected columns WID, EAN, Manufacturing_Date, Expiry_Date. Found: {row}"
                )
            wid_idx = header.index("wid")
            ean_idx = header.index("ean")
            mfg_idx = header.index("manufacturing_date")
            exp_idx = header.index("expiry_date")
            continue
            
        total_rows += 1
        
        max_idx = max(wid_idx, ean_idx, mfg_idx, exp_idx)
        if len(row) <= max_idx:
            skipped += 1
            continue
            
        wid = row[wid_idx].strip()
        ean = row[ean_idx].strip()
        mfg_str = row[mfg_idx].strip()
        exp_str = row[exp_idx].strip()
        
        if not wid or not ean or not mfg_str or not exp_str:
            skipped += 1
            continue
            
        try:
            mfg_date = parse_date(mfg_str)
            exp_date = parse_date(exp_str)
            batch_records.append((wid, ean, mfg_date, exp_date))
        except ValueError:
            skipped += 1
            continue
            
        if len(batch_records) >= batch_size:
            inserted_in_batch = await insert_batch(asyncpg_conn, batch_records)
            inserted += inserted_in_batch
            skipped += (len(batch_records) - inserted_in_batch)
            batch_records = []
            
    if batch_records:
        inserted_in_batch = await insert_batch(asyncpg_conn, batch_records)
        inserted += inserted_in_batch
        skipped += (len(batch_records) - inserted_in_batch)
        
    return {
        "success": True,
        "total_rows": total_rows,
        "inserted": inserted,
        "skipped": skipped
    }