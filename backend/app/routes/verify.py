from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.schemas.verification import VerifyResponse
from app.controllers.verify import create_verification_log

router = APIRouter()

@router.post("/verify", response_model=VerifyResponse)
async def verify_product(
    wid: str = Form(...),
    checked_by: str = Form(...),
    notes: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Submit verification data for a product. Logs the verification and
    saves an optional photo of the physical product.
    """
    try:
        log, product = await create_verification_log(
            db=db,
            wid=wid,
            checked_by=checked_by,
            notes=notes,
            photo=photo
        )
        return {
            "success": True,
            "log_id": log.id,
            "product": product
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Verification failed: {str(e)}"
        )
