import os
import asyncio
import time
from fastapi import UploadFile, HTTPException
import asyncpg

from app.controllers.jobs import update_job
from app.database import engine


# --------------- Configuration ---------------
TASK_TIMEOUT = 1200       # 20 minutes max processing time for massive files


# --------------- Helper functions ---------------

def count_lines(filepath: str) -> int:
    """Fast line count of a file (runs in executor thread).
    Subtracts 1 for the header row.
    """
    count = 0
    with open(filepath, "rb") as f:
        for _ in f:
            count += 1
    return max(count - 1, 0)


def _validate_csv_header(filepath: str) -> list:
    """Reads only the first line of the CSV and validates the header columns.
    Returns the list of lowercase column names.
    Raises ValueError if required columns are missing.
    """
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        first_line = f.readline().strip()

    if not first_line:
        raise ValueError("CSV file is empty.")

    # Split by comma and normalize
    columns = [col.strip().strip('"').lower() for col in first_line.split(",")]
    required = {"wid", "ean", "manufacturing_date", "expiry_date"}

    if not required.issubset(set(columns)):
        raise ValueError(
            f"Invalid CSV header. Expected columns: WID, EAN, Manufacturing_Date, Expiry_Date. "
            f"Found: {columns}"
        )

    return columns


# --------------- Background processing orchestrator ---------------

async def _process_csv_inner(filepath: str, job_id: str):
    """
    Orchestrates the full monolithic staging table ingestion pipeline:
    1. Validate CSV header (fast — reads 1 line)
    2. Count total lines (runs in thread)
    3. Stream the entire file to Postgres via COPY in one monolithic pass
    4. Run DISTINCT ON SQL deduplication and INSERT
    """
    loop = asyncio.get_event_loop()

    # Phase 1: Validate header (runs in thread, just reads first line)
    t0 = time.time()
    await loop.run_in_executor(None, _validate_csv_header, filepath)

    # Phase 2: Fast line count for total_rows
    t1 = time.time()
    total_rows = await loop.run_in_executor(None, count_lines, filepath)
    t2 = time.time()
    print(f"[Job {job_id}] Line count completed in {t2 - t1:.2f}s (Total rows: {total_rows})")
    
    await update_job(job_id, status="processing", total_rows=total_rows, chunks_total=1, chunks_done=0)

    # Phase 3: Monolithic Ingestion
    async with engine.connect() as sa_conn:
        raw_conn = await sa_conn.get_raw_connection()
        asyncpg_conn = raw_conn.driver_connection

        async with asyncpg_conn.transaction():
            # Safety & Tuning Parameters
            # Set high statement timeout
            await asyncpg_conn.execute("SET LOCAL statement_timeout = '1200s';")
            
            # Tune PostgreSQL memory parameters for bulk sorting/indexing
            await asyncpg_conn.execute("SET LOCAL maintenance_work_mem = '2GB';")
            await asyncpg_conn.execute("SET LOCAL work_mem = '1GB';")

            # 1. Create a temp table with all-text columns (drops on commit)
            # 1. Drop constraints
            t_drop_start = time.time()
            await asyncpg_conn.execute("""
                ALTER TABLE verification_logs DROP CONSTRAINT IF EXISTS verification_logs_wid_fkey;
                ALTER TABLE products DROP CONSTRAINT IF EXISTS products_pkey;
            """)
            print(f"[Job {job_id}] Constraints dropped in {time.time() - t_drop_start:.2f}s")

            # 2. Create staging table
            t_temp_start = time.time()
            await asyncpg_conn.execute("""
                CREATE TEMP TABLE _staging (
                    wid VARCHAR,
                    ean VARCHAR,
                    manufacturing_date VARCHAR,
                    expiry_date VARCHAR
                ) ON COMMIT DROP;
            """)
            print(f"[Job {job_id}] Temp table created in {time.time() - t_temp_start:.2f}s")

            # 3. COPY file into staging
            t_copy_start = time.time()
            with open(filepath, "rb") as f:
                await asyncpg_conn.copy_to_table(
                    "_staging",
                    source=f,
                    columns=["wid", "ean", "manufacturing_date", "expiry_date"],
                    format="csv",
                    header=True
                )
            print(f"[Job {job_id}] COPY to staging table completed in {time.time() - t_copy_start:.2f}s")

            # 4. Raw insert — no index, no sort, no DISTINCT ON
            # 4. Deduplicate within staging — remove duplicate WIDs keeping first occurrence
            t_sql_start = time.time()
            await asyncpg_conn.execute("""
                DELETE FROM _staging a USING _staging b
                WHERE a.ctid > b.ctid AND LOWER(TRIM(a.wid)) = LOWER(TRIM(b.wid));
            """)
            print(f"[Job {job_id}] Staging dedup completed in {time.time() - t_sql_start:.2f}s")

            # 5. Remove rows already existing in products
            t_existing_start = time.time()
            await asyncpg_conn.execute("""
                DELETE FROM _staging s
                WHERE EXISTS (SELECT 1 FROM products p WHERE p.wid = TRIM(s.wid));
            """)
            print(f"[Job {job_id}] Existing rows filtered in {time.time() - t_existing_start:.2f}s")

            # 6. Clean insert — no conflict handling needed
            t_insert_start = time.time()
            result = await asyncpg_conn.fetchrow("""
                WITH inserted AS (
                    INSERT INTO products (wid, ean, manufacturing_date, expiry_date)
                    SELECT TRIM(wid), TRIM(ean), manufacturing_date::DATE, expiry_date::DATE
                    FROM _staging
                    WHERE
                        TRIM(wid) IS NOT NULL AND TRIM(wid) != ''
                        AND TRIM(ean) IS NOT NULL AND TRIM(ean) != ''
                        AND manufacturing_date ~ '^\d{4}-\d{2}-\d{2}$'
                        AND expiry_date ~ '^\d{4}-\d{2}-\d{2}$'
                    RETURNING 1
                )
                SELECT COUNT(*) AS total_inserted FROM inserted;
            """)
            print(f"[Job {job_id}] INSERT completed in {time.time() - t_insert_start:.2f}s")

            inserted = result["total_inserted"] if result else 0
            skipped = total_rows - inserted

            print(f"[Job {job_id}] Total Ingestion Time: {time.time() - t0:.2f}s")

            await update_job(
                job_id,
                status="completed",
                total_rows=total_rows,
                processed_rows=total_rows,
                inserted=inserted,
                skipped=skipped,
                chunks_done=1,
            )

# --------------- Entry point ---------------

async def process_csv_from_file(filepath: str, job_id: str):
    """
    Background task entry point. Wraps the inner processing with:
    - Timeout protection (TASK_TIMEOUT seconds)
    - Error handling → marks job as failed
    - File cleanup → always deletes the temp file
    """
    try:
        await update_job(job_id, status="processing")

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
        print(f"[Job {job_id}] Fatal error: {e}")
        await update_job(
            job_id,
            status="failed",
            error=str(e),
        )
    finally:
        # Clean up the original uploaded file from disk
        try:
            os.remove(filepath)
        except OSError:
            pass