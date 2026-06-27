# Product Verification System

This is a high-performance, mobile-friendly full-stack application built for warehouse operations. It enables bulk product data ingestion from CSV sheets, on-the-floor verification with mobile camera support, and QA date-range activity reports.

---

## 🏗️ Architecture & Approach (Simple Breakdown)

We designed this system to handle **massive CSV files** (millions of rows) without crashing your browser or the server. Here is exactly what we are doing, why we are doing it, and how it works:

### 1. The Frontend (React + Vite)
*   **What we do:** Provide a clean drag-and-drop UI that instantly uploads the file and tracks progress in the background.
*   **Why we do it:** Long uploads can cause browsers to freeze or timeout. We want the user to be able to navigate away, refresh the page, or close their laptop without breaking the process.
*   **How it works:** 
    *   Once the file is uploaded, the frontend asks the server for progress every 4 seconds (**Polling**).
    *   We save the active upload IDs in your browser's **localStorage**. If you refresh the page, the frontend reads the localStorage, realizes there is an upload running, and instantly resumes the progress bar where it left off!

### 2. The Backend (FastAPI + Python)
*   **What we do:** Process the CSV file in small chunks rather than reading the whole thing at once.
*   **Why we do it:** Loading a 10-million row CSV directly into RAM will crash the server. We also want to process multiple chunks at the exact same time to speed things up.
*   **How it works:**
    *   **Streaming:** We read the file line-by-line and group the rows into "chunks" of 100,000.
    *   **Concurrent Workers:** We spawn 6 to 8 background "workers" that run at the same time in parallel. Each worker grabs a chunk of 100,000 rows and pushes it to the database independently.
    *   **Duplicate Detection:** If a user accidentally uploads the same file twice, the backend generates a "fingerprint" (filename + size). If it matches a currently running upload, it ignores the new file and just links you to the existing progress bar!

### 3. The Database (PostgreSQL)
*   **What we do:** Bulk insert hundreds of thousands of rows per second while ignoring duplicates.
*   **Why we do it:** Standard `INSERT` commands are far too slow for millions of rows.
*   **How it works:** 
    *   We use the PostgreSQL **`COPY` command** (which is written in C and is the absolute fastest way to get data into Postgres). 
    *   The workers `COPY` their 100K chunks into a **Temporary Table** first.
    *   Then, we do an `INSERT INTO ... SELECT ... ON CONFLICT DO NOTHING`. This merges the temporary table into the main products table, smoothly throwing away any duplicate Product IDs without crashing!

### 4. The Flow (End-to-End)
1. **Upload:** User drops a CSV file in the browser. The browser sends the raw file to the backend (`POST /api/upload-csv`).
2. **Setup:** The backend saves the file to disk temporarily, registers a unique `job_id` in memory, and immediately replies to the browser: *"Got it! Here is your job_id."*
3. **Tracking:** The frontend starts a 4-second loop, asking the backend: *"How is job_id doing?"* (`GET /api/jobs/{job_id}`).
4. **Execution:** Meanwhile, the backend counts the total lines, slices the file into 100,000-row chunks, and hands them out to 8 asynchronous PostgreSQL database connections.
5. **Completion:** As each chunk is successfully copied into the database, the backend updates the live progress counters. Once the last chunk is done, the temporary file is deleted, the status is marked as "completed", and the frontend shows the final success screen!

### 5. Current Bottlenecks (Why 10M rows takes a few minutes)
While the current architecture is incredibly robust, ingesting massive 10M+ row files still takes a few minutes due to three primary bottlenecks:
*   **Python Date Parsing (CPU):** We are currently looping through every row in Python and converting the date strings to Python `datetime` objects. For 10M rows, that's 20 million CPU-intensive `strptime` operations before the database even sees the data.
*   **Row-by-Row Validation (CPU):** Reading the CSV row-by-row in pure Python using `csv.reader` and stripping whitespace is naturally slower than C-level parsers (like Pandas).
*   **Database Index Lookups (I/O):** The `ON CONFLICT DO NOTHING` command forces PostgreSQL to check its unique B-Tree index 10 million times to ensure no duplicate WIDs are inserted. This constraint checking is the physical limit of standard relational database inserts.
*(To bypass these CPU bottlenecks, future optimizations could push the CSV parsing into a C-engine like Pandas, and pass raw strings directly to PostgreSQL to handle date casting natively).*

---

## 📁 Folder Structure

```text
├── backend/
│   ├── app/
│   │   ├── main.py              # App entry point & startup checks
│   │   ├── config.py            # Environment configurations (.env loader)
│   │   ├── database.py          # SQLAlchemy async engine & connection pool
│   │   ├── models/
│   │   │   ├── product.py       # SQL model for products table
│   │   │   └── verification.py  # SQL model for verification_logs
│   │   ├── controllers/
│   │   │   ├── upload.py        # 8x Concurrent CSV processing & DB COPY
│   │   │   ├── jobs.py          # In-memory tracking & fingerprinting
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
│   ├── uploads/                 # Storage for uploaded verify snapshots
│   └── .env                     # Setup environment variables configuration
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

## 💻 Tech Stack

*   **Backend:** FastAPI, PostgreSQL, `asyncpg` (driver), SQLAlchemy, Alembic, `aiofiles`.
*   **Frontend:** React 18, Vite, Tailwind CSS, Radix UI Primitives, Axios, React Hook Form, Lucide React.

---

## 🚀 Local Setup Instructions

### Prerequisites
*   **Python:** version 3.12 or newer.
*   **Node.js & npm:** Node version 18 or newer.
*   **PostgreSQL:** database service installed and running locally.

### 1. Database Configuration
Create a database named `product_verification` on your local PostgreSQL server:
```sql
CREATE DATABASE product_verification;
```

### 2. Backend Setup
1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\pip.exe install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and set your database URL:
   ```env
   DATABASE_URL=postgresql+asyncpg://postgres:your_password@localhost:5432/product_verification
   ```
4. Run the database migrations:
   ```powershell
   .\.venv\Scripts\alembic.exe upgrade head
   ```
5. Start the backend development server:
   ```powershell
   .\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
   ```
   *The server will print `✅ DATABASE CONNECTED SUCCESSFULLY` if your credentials are correct.*

### 3. Frontend Setup
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The frontend application will boot up at `http://localhost:5173`.

---

## 📡 Core API Endpoints Reference

### 1. Ingest CSV Products (Background Processing)
*   **Method:** `POST`
*   **URL:** `/api/upload-csv`
*   **Payload:** `multipart/form-data` with `files`
*   **Response:**
    ```json
    {
      "success": true,
      "total_files": 1,
      "jobs": [
        {
          "filename": "slot1.csv",
          "job_id": "05bb55c4-b4e4-48e0-a864-42a91db28b25",
          "status": "processing",
          "duplicate": false
        }
      ]
    }
    ```

### 2. Poll Job Status (Track Progress)
*   **Method:** `GET`
*   **URL:** `/api/jobs/{job_id}`
*   **Response:** Returns live metrics for the deterministic progress bar.
    ```json
    {
      "job_id": "05bb55c4-b4e4-48e0-a864-42a91db28b25",
      "status": "processing",
      "total_rows": 12818,
      "processed_rows": 5000,
      "inserted": 5000,
      "skipped": 0,
      "error": null
    }
    ```

### 3. Submit Verification Check
*   **Method:** `POST`
*   **URL:** `/api/verify`
*   **Payload:** `multipart/form-data` (wid, checked_by, notes, photo)
*   **Response:**
    ```json
    {
      "success": true,
      "log_id": 4,
      "product": { ... }
    }
    ```

### 4. Filter Verification Reports
*   **Method:** `GET`
*   **URL:** `/api/reports`
*   **Params:** `start_date`, `end_date`, `page`, `limit`
