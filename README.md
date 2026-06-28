# Product Verification System

A high-performance, mobile-friendly full-stack application built for warehouse operations. It enables bulk product data ingestion from CSV sheets (tested with 10M+ rows), on-the-floor product verification with mobile camera support, and QA date-range activity reports.

---

## Architecture & Approach

We designed this system to handle **massive CSV files** (millions of rows) without crashing the browser or the server. Below is a detailed breakdown of what we do, why we do it, and how every piece fits together.

---

### 1. The Frontend (React + Vite)

**What it does:** Provides an optimized, drag-and-drop CSV upload panel and shows real-time progress of background database writes.

**Why it matters:** Ingesting millions of rows can take some time. If the page is reloaded or the tab is closed, we need to pick up where we left off, but we must never leak one operator's upload progress to another operator on the same network.

**How it works:**

- **CSV Upload:** The user drops a CSV file. The browser sends it via a `POST` request. Once the upload of bytes to the backend is complete, the API returns a unique `job_id` immediately.
- **Background Polling:** The frontend polls `GET /api/jobs/{job_id}` every **4 seconds** to fetch live database progress.
- **Strict User Isolation:** The active `job_id`s are saved in the browser's **localStorage** (`active_jobs`). On page load/refresh, the frontend:
  1. Reads ONLY the `job_id`s stored in its own local storage.
  2. Polls those specific job IDs to resume tracking.
  3. Does not query any global list of active jobs, meaning User B will never see the progress bar or stats for User A's active uploads.
- **Live Counter & Stats:** The interface displays an indeterminate animation bar alongside live counter badges for:
  - **Processed rows** (total read so far)
  - **Inserted rows** (new unique records saved)
  - **Skipped rows** (malformed lines or pre-existing duplicates skipped)

---

### 2. The Backend (FastAPI + Python)

**What it does:** Receives the CSV file, saves it to disk, and streams it into PostgreSQL using asynchronous background workers.

**Why it matters:** Large files (like 10M rows) take significant time to process. SPawning a background task keeps the API responsive (avoids HTTP connection timeouts) and lets us track real-time progress.

**How it works (the "Batch COPY + Temp Table" pattern):**

1. **Quick Handshake:** Python reads only the CSV header to verify that the required columns (`WID`, `EAN`, `Manufacturing_Date`, `Expiry_Date`) are present, saves the file to the disk uploads directory, registers a new job UUID, and immediately returns the job ID to the frontend.

2. **Asynchronous File Reader:** A background worker is triggered. It reads the file row-by-row from disk using a memory-efficient stream generator to prevent memory usage spikes on the server.

3. **High-Performance COPY Batches:** The generator parses and validates dates in memory, loading data in chunks of **50,000 rows**. Each chunk is streamed directly into a temporary database table (`CREATE TEMP TABLE ... ON COMMIT DROP`) using PostgreSQL's binary `COPY` protocol via `copy_records_to_table`.

4. **Upsert Merger:** After copying a batch to the staging table, a quick upsert query is run:
   ```sql
   INSERT INTO products (wid, ean, manufacturing_date, expiry_date)
   SELECT wid, ean, manufacturing_date, expiry_date FROM temp_products
   ON CONFLICT (wid) DO NOTHING;
   ```
   This lets PostgreSQL handle record insertion and index conflicts at database C-speed.

5. **Progress & Cleanup:** The worker commits the transaction for the batch, updates the in-memory job tracker with the processed counts, and clears the temp table. Once the entire file is ingested, the uploaded CSV is deleted from disk.

---

### 3. The Database (PostgreSQL)

**What it does:** Handles all data validation, date parsing, and deduplication at C-level speed.

**Why it matters:** PostgreSQL's `COPY` command is the absolute fastest way to get data into a relational database. It bypasses the normal SQL query planner entirely and writes raw tuples directly into table pages. Combined with an `UNLOGGED` or `TEMP` table (which skips Write-Ahead Log writes), it can ingest hundreds of thousands of rows per second.

**How it works:**
- Each chunk gets its own `CREATE TEMP TABLE ... ON COMMIT DROP` — a temporary table that only exists for the duration of that one transaction. This means:
  - Multiple uploads happening at the same time will **never interfere** with each other (each gets its own isolated temp table).
  - The temp table is automatically destroyed when the transaction commits, so there's no cleanup needed.
- The `INSERT INTO products SELECT ... FROM _staging ON CONFLICT DO NOTHING` query lets Postgres handle deduplication natively using its B-Tree index on the `wid` column.

---

### 4. The Flow (Step by Step)

Here is exactly what happens when a user uploads a 10-million row CSV file:

```
User drops file → Browser sends file to server
                         ↓
              Server saves file to disk
              Server creates a job_id
              Server replies: "Got it, here's your job_id"
                         ↓
              Frontend starts polling every 4 seconds
                         ↓
              Backend validates the CSV header (1 line read)
              Backend counts total lines (fast byte scan)
                         ↓
              Monolithic COPY streams 10M rows directly to Temp Table
              (Frontend shows indeterminate "Streaming..." bar)
                         ↓
              SQL deduplicates, parses dates, and inserts all 10M rows
              (Postgres uses 2GB maintenance_work_mem)
                         ↓
              Backend marks job as "completed"
              Backend deletes uploaded file from disk
                         ↓
              Frontend shows success screen with final counts
```

---

### 5. Edge Cases We Handle

| Edge Case | What Could Go Wrong | How We Handle It |
|-----------|---------------------|------------------|
| **Concurrent uploads** | Two users upload at the same time. If they share a staging table, one user's data gets wiped. | The import uses a `TEMP TABLE` scoped strictly to a single database connection. No shared state, no collisions. |
| **User refreshes the page** | The progress bar disappears. User thinks the upload failed and tries again. | Job IDs are saved in `localStorage`. On page load, the frontend checks localStorage and resumes tracking any active jobs. |
| **Duplicate file upload** | User accidentally uploads the same file twice while the first one is still processing. | The backend generates a fingerprint (`filename + file_size`). If it matches an active job, it returns the existing job_id instead of starting a new one. |
| **WAL Space Exhaustion** | Inserting 10M rows in a single SQL transaction can exhaust the Postgres Write-Ahead Log. | We execute `SET LOCAL checkpoint_completion_target = 0.9` to optimize flush pacing. |
| **B-Tree I/O Bottleneck** | Maintaining a B-Tree index on 10M inserts causes constant rebalancing and disk thrashing. | We drop the Primary Key before inserting and rebuild it after. PostgreSQL writes rows unindexed at raw I/O speed, then builds the index in one optimized bulk sort pass. |
| **Duplicate WIDs in uploaded CSV** | If the same WID appears twice in the file, the Primary Key rebuild would fail and roll back the entire transaction. | We run a `DELETE ... USING` self-join on the staging table before inserting to remove intra-file duplicates, keeping only the first occurrence. |
| **Re-uploading existing data** | If a warehouse manager re-uploads a file that's already been ingested, rows would conflict during the Primary Key rebuild. | We run a second DELETE pass on the staging table filtering out any WIDs already present in `products`, so only genuinely new rows are inserted. |
| **SQL query hangs** | The monolithic `INSERT INTO ... SELECT` query takes too long and times out. | We set `SET LOCAL statement_timeout = '1200s'` (20 minutes) specifically for this transaction. |
| **Header row gets inserted** | If we forget to skip the header, Postgres tries to insert "WID" as a product. | `COPY` uses `header=True` to skip the first row gracefully. |

---

### 6. Edge Cases We Intentionally Skip (For Now)

| Edge Case | Why We Skip It |
|-----------|---------------|
| **Malformed CSV rows** (wrong number of columns) | PostgreSQL's `COPY` command will hard-crash the entire transaction if it encounters a row with the wrong column count. Handling this would require pre-filtering every line in Python (counting commas), which adds back CPU overhead. For now, we assume the CSV is well-formed. |
| **Non-UTF8 encoding** | Files with Windows-1252 or Latin-1 characters would cause `COPY` to crash with an encoding error. We open files with `errors="replace"` which silently replaces bad bytes, but true encoding detection (like `chardet`) is not implemented. |

---

### 7. Ingestion Pipeline & Architecture History

#### Previous Architecture (v1) — "Python Does Everything"
- Python read every CSV row using `csv.reader`
- Python called `datetime.strptime()` on every date field (20M calls for 10M rows)
- Python stripped whitespace, validated nulls, built tuples
- 8 async workers sent 100K-row batches to Postgres via `COPY`
- **Result:** ~3–5 minutes for 10M rows. CPU was the bottleneck, not the database.

#### Current Architecture (v4) — "Hybrid Index-Build with Staged Deduplication"
- Python streams the raw file directly into a temporary staging table via PostgreSQL's `COPY` 
  command. No Python-level parsing, no loops, no batching.
- Before inserting, we surgically drop the Primary Key constraint and its dependent Foreign Key 
  on `verification_logs`. This removes all B-Tree index maintenance overhead during the insert.
- Two lightweight DELETE passes run on the staging table (which has no indexes, making them cheap):
  1. **Intra-file deduplication:** Removes duplicate WIDs within the uploaded CSV, keeping the first occurrence.
  2. **Cross-table deduplication:** Removes rows whose WIDs already exist in `products`.
- A clean, index-free INSERT writes all remaining valid rows directly to disk at raw I/O speed.
- Finally, `ALTER TABLE products ADD PRIMARY KEY (wid)` rebuilds the index in one optimized 
  bulk sort pass — far faster than maintaining it incrementally during inserts.
- **Result:** 10M rows ingested in ~110 seconds, down from 6+ minutes in v1.

---

### 7. Ingestion Pipeline & Architecture History

#### Previous Architecture (v1) — "Python Does Everything"
- Python read every CSV row using `csv.reader`
- Python called `datetime.strptime()` on every date field (20M calls for 10M rows)
- Python stripped whitespace, validated nulls, built tuples
- 8 async workers sent 100K-row batches to Postgres via `COPY`
- **Result:** ~3–5 minutes for 10M rows. CPU was the bottleneck, not the database.

#### Current Architecture (v4) — "Hybrid Index-Build with Staged Deduplication"
- Python streams the raw file directly into a temporary staging table via PostgreSQL's `COPY` 
  command. No Python-level parsing, no loops, no batching.
- Before inserting, we surgically drop the Primary Key constraint and its dependent Foreign Key 
  on `verification_logs`. This removes all B-Tree index maintenance overhead during the insert.
- Two lightweight DELETE passes run on the staging table (which has no indexes, making them cheap):
  1. **Intra-file deduplication:** Removes duplicate WIDs within the uploaded CSV, keeping the first occurrence.
  2. **Cross-table deduplication:** Removes rows whose WIDs already exist in `products`.
- A clean, index-free INSERT writes all remaining valid rows directly to disk at raw I/O speed.
- Finally, `ALTER TABLE products ADD PRIMARY KEY (wid)` rebuilds the index in one optimized 
  bulk sort pass — far faster than maintaining it incrementally during inserts.
- **Result:** 10M rows ingested in ~110 seconds, down from 6+ minutes in v1.

---

## Folder Structure

```text
├── backend/
│   ├── app/
│   │   ├── main.py              # App entry point, DB connection check on startup
│   │   ├── config.py            # Environment configurations (.env loader)
│   │   ├── database.py          # SQLAlchemy async engine & connection pool
│   │   ├── models/
│   │   │   ├── product.py       # SQL model for products table
│   │   │   └── verification.py  # SQL model for verification_logs
│   │   ├── controllers/
│   │   │   ├── upload.py        # Staging Table ingestion (COPY + SQL)
│   │   │   ├── jobs.py          # In-memory job tracking & fingerprinting
│   │   │   ├── product.py       # WID lookup queries
│   │   │   └── verification.py  # Log insertion & report filters
│   │   ├── routes/
│   │   │   ├── upload.py        # /api/upload-csv & /api/jobs endpoints
│   │   │   ├── product.py       # /api/product/{wid}
│   │   │   └── verification.py  # /api/verify & /api/reports
│   │   └── schemas/
│   │       ├── product.py       # Pydantic schemas for product lookup
│   │       └── verification.py  # Pydantic schemas for verify & reports
│   ├── migrations/              # Alembic migrations directory
│   ├── uploads/                 # Temp storage for uploaded files
│   └── .env                     # Database URL & server config
│
├── frontend/
│   ├── src/
│   │   ├── components/          # FileUploadZone.jsx, CameraCapture.jsx, etc.
│   │   ├── pages/               # UploadPage, VerifyPage, ReportsPage
│   │   ├── services/            # Axios API wrappers (api.js)
│   │   └── App.jsx              # Routing configurations
│   └── package.json             # Frontend dependencies
```

---

## Tech Stack

*   **Backend:** FastAPI, PostgreSQL, `asyncpg` (async driver), SQLAlchemy, Alembic, `aiofiles`
*   **Frontend:** React 18, Vite, Tailwind CSS, Radix UI Primitives, Axios, React Hook Form, Lucide React

---

## Local Setup Instructions

You can run the entire application stack either using **Docker** (recommended - zero local database or dependency installation required) or **manually** on your machine.

---

### Option A: Quick Setup with Docker (Recommended)
This runs the entire stack (Frontend, Backend, and PostgreSQL database) inside isolated containers. 

#### Prerequisites
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

#### Setup & Start
1. From the root directory, run:
   ```bash
   docker compose up --build
   ```
2. Once the containers are healthy and running:
   - **Frontend:** Access the interface at `http://localhost:5173`
   - **Backend API:** Access the Swagger docs or healthcheck at `http://localhost:8000/api`
   - **Database:** Runs inside the container. The backend automatically applies all Alembic database schema migrations on startup.

---

### Option B: Manual Setup (Without Docker)
Use this option to run the services directly on your host machine.

#### Prerequisites
*   **Python:** version 3.12 or newer
*   **Node.js & npm:** Node version 18 or newer
*   **PostgreSQL:** installed and running locally, or a remote PostgreSQL instance (like Supabase)

#### 1. Backend Setup
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements.txt
```
Copy `.env.example` to `.env` and set your database URL (the backend automatically creates the database if it doesn't exist on startup):
```env
DATABASE_URL=postgresql+asyncpg://postgres:your_password@localhost:5432/product_verification
```

Start the backend development server:
```bash
.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```
*(Note: On startup, the backend checks and creates the target database if it is missing, and automatically applies all Alembic migrations.)*

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The frontend application will boot up at `http://localhost:5173`.

---

## API Endpoints

### 1. Upload CSV (Background Processing)
*   **POST** `/api/upload-csv`
*   **Payload:** `multipart/form-data` with `files`
*   **Response:**
    ```json
    {
      "success": true,
      "total_files": 1,
      "jobs": [
        {
          "filename": "products_10m.csv",
          "job_id": "05bb55c4-b4e4-48e0-a864-42a91db28b25",
          "status": "processing",
          "duplicate": false
        }
      ]
    }
    ```

### 2. Poll Job Status
*   **GET** `/api/jobs/{job_id}`
*   **Response:**
    ```json
    {
      "job_id": "05bb55c4-b4e4-48e0-a864-42a91db28b25",
      "status": "processing",
      "total_rows": 10000000,
      "processed_rows": 4000000,
      "inserted": 3998500,
      "skipped": 1500,
      "chunks_total": 3,
      "chunks_done": 1,
      "error": null
    }
    ```

### 3. Recover Active Jobs (Page Refresh)
*   **GET** `/api/jobs`
*   Returns all recent jobs from the last 30 minutes so the frontend can resume tracking after a page refresh.

### 4. Product Lookup
*   **GET** `/api/product/{wid}`

### 5. Submit Verification
*   **POST** `/api/verify`
*   **Payload:** `multipart/form-data` (wid, checked_by, notes, photo)

### 6. Verification Reports
*   **GET** `/api/reports`
*   **Params:** `start_date`, `end_date`, `page`, `limit`
