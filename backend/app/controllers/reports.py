from datetime import datetime, date, time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, desc
from sqlalchemy.orm import joinedload

from app.models.verification import VerificationLog

async def get_verification_reports(
    db: AsyncSession,
    start_date: date,
    end_date: date,
    page: int = 1,
    limit: int = 50
):
    """
    Fetches verification logs joined with product details
    filtered by checked_at between start_date and end_date.
    Includes pagination.
    """
    # Combine dates with times to cover full days
    start_dt = datetime.combine(start_date, time.min)
    end_dt = datetime.combine(end_date, time.max)
    
    # Calculate offset
    offset = (page - 1) * limit
    
    # Construct paginated query
    stmt = (
        select(VerificationLog)
        .options(joinedload(VerificationLog.product))
        .where(and_(
            VerificationLog.checked_at >= start_dt,
            VerificationLog.checked_at <= end_dt
        ))
        .order_by(desc(VerificationLog.checked_at))
        .offset(offset)
        .limit(limit)
    )
    
    result = await db.execute(stmt)
    logs = result.scalars().all()
    
    # Flatten the result structure for reports schema
    flat_reports = []
    for log in logs:
        flat_reports.append({
            "id": log.id,
            "wid": log.wid,
            "checked_by": log.checked_by,
            "photo_url": log.photo_url,
            "checked_at": log.checked_at,
            "notes": log.notes,
            "ean": log.product.ean,
            "manufacturing_date": log.product.manufacturing_date,
            "expiry_date": log.product.expiry_date
        })
        
    return flat_reports
