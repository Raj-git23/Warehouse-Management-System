"""
In-memory job tracker for background CSV processing tasks.
Each upload gets a unique job_id. The background worker updates
progress here, and the polling endpoint reads from here.
"""

import uuid
import asyncio
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional, Dict


# How long to keep completed/failed jobs before auto-cleanup
JOB_RETENTION_MINUTES = 30


@dataclass
class JobStatus:
    """Represents the state of a single CSV import job."""
    job_id: str
    filename: str
    file_size: int = 0  # bytes — used for duplicate fingerprint
    status: str = "pending"  # pending | uploading | processing | completed | failed
    total_rows: int = 0
    processed_rows: int = 0
    inserted: int = 0
    skipped: int = 0
    chunks_total: int = 0
    chunks_done: int = 0
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def fingerprint(self) -> str:
        """Simple fingerprint based on filename + file size."""
        return f"{self.filename}::{self.file_size}"

    @property
    def is_active(self) -> bool:
        """Returns True if the job is still running."""
        return self.status in ("pending", "uploading", "processing")

    def to_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "filename": self.filename,
            "file_size": self.file_size,
            "status": self.status,
            "total_rows": self.total_rows,
            "processed_rows": self.processed_rows,
            "inserted": self.inserted,
            "skipped": self.skipped,
            "chunks_total": self.chunks_total,
            "chunks_done": self.chunks_done,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# Global in-memory job store
_jobs: Dict[str, JobStatus] = {}
# Lock for safe concurrent access
_lock = asyncio.Lock()


async def create_job(filename: str, file_size: int = 0) -> JobStatus:
    """Create a new job entry and return it."""
    # First, run cleanup of stale jobs
    await _cleanup_old_jobs()

    job_id = str(uuid.uuid4())
    job = JobStatus(job_id=job_id, filename=filename, file_size=file_size)
    async with _lock:
        _jobs[job_id] = job
    return job


async def get_job(job_id: str) -> Optional[JobStatus]:
    """Retrieve a job by its ID."""
    async with _lock:
        return _jobs.get(job_id)


async def update_job(job_id: str, **kwargs) -> Optional[JobStatus]:
    """Update fields on a job. Pass any JobStatus field as a keyword arg."""
    async with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        for key, value in kwargs.items():
            if hasattr(job, key):
                setattr(job, key, value)
        job.updated_at = datetime.utcnow()
        return job


async def delete_job(job_id: str):
    """Remove a job from the store (cleanup)."""
    async with _lock:
        _jobs.pop(job_id, None)


async def find_active_job_by_fingerprint(filename: str, file_size: int) -> Optional[JobStatus]:
    """Check if there's an active job with the same file fingerprint.
    Used to prevent duplicate uploads of the same file.
    """
    fingerprint = f"{filename}::{file_size}"
    async with _lock:
        for job in _jobs.values():
            if job.fingerprint == fingerprint and job.is_active:
                return job
    return None


async def list_recent_jobs() -> list:
    """List all jobs from the last JOB_RETENTION_MINUTES minutes.
    Called by frontend on page load for recovery.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=JOB_RETENTION_MINUTES)
    async with _lock:
        return [
            job.to_dict()
            for job in _jobs.values()
            if job.created_at >= cutoff
        ]


async def list_jobs() -> list:
    """List all jobs (for debugging)."""
    async with _lock:
        return [job.to_dict() for job in _jobs.values()]


async def _cleanup_old_jobs():
    """Remove completed/failed jobs older than JOB_RETENTION_MINUTES.
    Active jobs are never cleaned up regardless of age.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=JOB_RETENTION_MINUTES)
    async with _lock:
        stale_ids = [
            job_id
            for job_id, job in _jobs.items()
            if not job.is_active and job.updated_at < cutoff
        ]
        for job_id in stale_ids:
            del _jobs[job_id]
