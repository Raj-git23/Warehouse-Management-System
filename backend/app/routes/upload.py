from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.controllers.upload import process_csv_upload

router = APIRouter()

@router.post("/upload-csv")
async def upload_csv(
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload multiple CSV files containing product data.
    Validates CSV headers, bulk inserts records for each file,
    and returns a consolidated summary with individual file details.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    consolidated_inserted = 0
    consolidated_skipped = 0
    consolidated_total_rows = 0
    details = []
    
    for file in files:
        if not file.filename or not file.filename.endswith('.csv'):
            details.append({
                "filename": file.filename or "unknown",
                "success": False,
                "error": "Only CSV files (.csv) are supported."
            })
            continue
            
        try:
            # Re-seek to the beginning of the file since it's a new upload stream
            await file.seek(0)
            result = await process_csv_upload(file, db)
            
            consolidated_inserted += result["inserted"]
            consolidated_skipped += result["skipped"]
            consolidated_total_rows += result["total_rows"]
            
            details.append({
                "filename": file.filename,
                "success": True,
                "total_rows": result["total_rows"],
                "inserted": result["inserted"],
                "skipped": result["skipped"]
            })
        except HTTPException as http_ex:
            details.append({
                "filename": file.filename,
                "success": False,
                "error": http_ex.detail
            })
        except Exception as ex:
            details.append({
                "filename": file.filename,
                "success": False,
                "error": f"CSV processing failed: {str(ex)}"
            })
            
    # Check if all files failed to process and raise an exception if so
    if len(details) > 0 and all(not d["success"] for d in details):
        raise HTTPException(
            status_code=400,
            detail=f"All files failed to process. Details: {details}"
        )
        
    return {
        "success": True,
        "total_files": len(files),
        "total_rows": consolidated_total_rows,
        "inserted": consolidated_inserted,
        "skipped": consolidated_skipped,
        "details": details
    }
