import csv
from datetime import datetime, date
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import asyncpg


# --------------- Helper functions ---------------
def parse_date(date_str: str) -> date:
    """Parses date string in YYYY-MM-DD format."""
    return datetime.strptime(date_str.strip(), "%Y-%m-%d").date()

async def csv_row_generator(file: UploadFile):
    """Async generator that reads the uploaded file in chunks and yields CSV rows."""
    chunk_size = 1024 * 1024  # 1MB chunk
    buffer = ""
    # reads chunk → decodes bytes to text → adds to buffer
    # splits buffer into lines
    # if last line is incomplete, keeps it in buffer for next chunk
    
    # Reset file pointer to beginning just in case
    await file.seek(0)
    
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
            
        # Decode the chunk
        text = chunk.decode("utf-8", errors="replace")
        buffer += text
        
        # Split buffer into lines
        lines = buffer.splitlines(keepends=True)
        if not lines:
            continue
            
        # If the last line is incomplete, keep it in the buffer
        if not text.endswith(("\n", "\r")):
            buffer = lines.pop()
        else:
            buffer = ""
            
        for line in lines:
            # Parse the CSV line
            reader = csv.reader([line.strip()])
            for row in reader:
                if row:  # Skip empty lines
                    yield row
                    
    # Handle remaining text in buffer
    if buffer:
        reader = csv.reader([buffer.strip()])
        for row in reader:
            if row:
                yield row

async def insert_batch(conn: asyncpg.Connection, records: list) -> int:
    """Inserts a batch of records into database using a temporary table and COPY."""
    # We run inside an explicit transaction block for the COPY and merge
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


# ----------------- Main function ---------

async def process_csv_upload(file: UploadFile, db: AsyncSession):
    """
    Stream-parses CSV product data and bulk inserts into the products table in batches of 5000 using asyncpg's copy_records_to_table.
    Handles duplicate WIDs gracefully with ON CONFLICT DO NOTHING.
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
    
    # Get the raw connection from the SQLAlchemy session
    conn = await db.connection()
    raw_conn = await conn.get_raw_connection()
    # Extract the underlying asyncpg.Connection
    asyncpg_conn = raw_conn.driver_connection
    
    async for row in csv_row_generator(file):
        # 1. Parse header
        if header is None:
            header = [col.strip().lower() for col in row]
            required = {"wid", "ean", "manufacturing_date", "expiry_date"}
            if not required.issubset(set(header)):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid CSV header. Expected columns WID, EAN, Manufacturing_Date, Expiry_Date. Found: {row}"
                )
            # Map header indices
            wid_idx = header.index("wid")
            ean_idx = header.index("ean")
            mfg_idx = header.index("manufacturing_date")
            exp_idx = header.index("expiry_date")
            continue
            
        # 2. Process data row
        total_rows += 1
        
        # Ensure row has enough columns
        max_idx = max(wid_idx, ean_idx, mfg_idx, exp_idx)
        if len(row) <= max_idx:
            skipped += 1
            continue
            
        wid = row[wid_idx].strip()
        ean = row[ean_idx].strip()
        mfg_str = row[mfg_idx].strip()
        exp_str = row[exp_idx].strip()
        
        # Validate data
        if not wid or not ean or not mfg_str or not exp_str:
            skipped += 1
            continue
            
        try:
            mfg_date = parse_date(mfg_str)
            exp_date = parse_date(exp_str)
            batch_records.append((wid, ean, mfg_date, exp_date))
        except ValueError:
            # Bad date format
            skipped += 1
            continue
            
        # 3. Batch insert when limit is reached
        if len(batch_records) >= batch_size:
            inserted_in_batch = await insert_batch(asyncpg_conn, batch_records)
            inserted += inserted_in_batch
            skipped += (len(batch_records) - inserted_in_batch)
            batch_records = []
            
    # Insert any remaining records
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