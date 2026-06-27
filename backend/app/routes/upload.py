import os
import asyncio
import aiofiles
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List

from app.controllers.upload import process_csv_from_file
from app.controllers.jobs import (
    create_job,
    get_job,
    update_job,
    find_active_job_by_fingerprint,
    list_recent_jobs,
)
from app import config

router = APIRouter()


@router.post("/upload-csv")
async def upload_csv(
    files: List[UploadFile] = File(...),
):
    """Upload CSV files containing product data.
    
    All files are saved to disk and processed in the background
    using concurrent async workers. Returns job_ids for polling.
    
    Duplicate detection: if a file with the same name + size is
    already being processed, returns the existing job_id.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    jobs_created = []

    for file in files:
        if not file.filename or not file.filename.endswith('.csv'):
            jobs_created.append({
                "filename": file.filename or "unknown",
                "success": False,
                "error": "Only CSV files (.csv) are supported."
            })
            continue

        file_size = file.size or 0
        if file_size == 0:
            jobs_created.append({
                "filename": file.filename,
                "success": False,
                "error": "Uploaded file is empty."
            })
            continue

        try:
            # Check for duplicate active upload
            existing_job = await find_active_job_by_fingerprint(
                file.filename, file_size
            )
            if existing_job:
                jobs_created.append({
                    "filename": file.filename,
                    "job_id": existing_job.job_id,
                    "status": existing_job.status,
                    "duplicate": True,
                    "message": "This file is already being processed.",
                    "success": True,
                })
                continue

            # Create job with fingerprint info
            job = await create_job(file.filename, file_size)

            # Save file to disk
            save_path = os.path.join(
                str(config.UPLOAD_DIR), f"import_{job.job_id}.csv"
            )
            async with aiofiles.open(save_path, "wb") as out_file:
                # Stream write in 2 MB chunks to avoid memory spike
                await file.seek(0)
                while True:
                    chunk = await file.read(2 * 1024 * 1024)
                    if not chunk:
                        break
                    await out_file.write(chunk)

            await update_job(job.job_id, status="uploading")

            # Launch background processing task
            asyncio.create_task(
                process_csv_from_file(save_path, job.job_id)
            )

            jobs_created.append({
                "filename": file.filename,
                "job_id": job.job_id,
                "status": "processing",
                "duplicate": False,
                "success": True,
            })

        except Exception as ex:
            jobs_created.append({
                "filename": file.filename,
                "success": False,
                "error": f"Failed to queue job: {str(ex)}"
            })

    # Check if all files failed
    if all(not j.get("success", False) for j in jobs_created):
        raise HTTPException(
            status_code=400,
            detail=f"All files failed. Details: {jobs_created}"
        )

    return {
        "success": True,
        "total_files": len(files),
        "jobs": jobs_created,
    }


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Polling endpoint: returns current status of a single job.
    
    Frontend polls this every 4 seconds to track progress.
    Returns processed_rows, total_rows, inserted, skipped, status.
    """
    job = await get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job '{job_id}' not found. It may have expired."
        )
    return job.to_dict()


@router.get("/jobs")
async def list_all_jobs():
    """Returns all recent jobs (last 30 minutes).
    
    Called by frontend on page load to recover any in-progress
    or recently completed uploads after a refresh/tab close.
    """
    jobs = await list_recent_jobs()
    return {"jobs": jobs}
