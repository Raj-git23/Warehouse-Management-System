from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from typing import List

from app.database import get_db
from app.schemas.verification import ReportResponse
from app.controllers.reports import get_verification_reports

router = APIRouter()

@router.get("/reports", response_model=List[ReportResponse])
async def get_reports(
    start_date: date = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: date = Query(..., description="End date in YYYY-MM-DD format"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get verification reports between start_date and end_date.
    Includes product information and supports pagination.
    """
    if start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="Start date must be before or equal to end date."
        )
    try:
        reports = await get_verification_reports(
            db=db,
            start_date=start_date,
            end_date=end_date,
            page=page,
            limit=limit
        )
        return reports
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load reports: {str(e)}"
        )
