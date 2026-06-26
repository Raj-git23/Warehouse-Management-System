import uuid
from pathlib import Path
import aiofiles
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app import config
from app.models.product import Product
from app.models.verification import VerificationLog

async def create_verification_log(
    db: AsyncSession,
    wid: str,
    checked_by: str,
    notes: str = None,
    photo: UploadFile = None
):
    """
    Validates that a product with the given WID exists,
    saves the uploaded photo asynchronously,
    and inserts a verification log entry.
    """
    # check for valid WID and checked_by
    wid = wid.strip()
    checked_by = checked_by.strip()
    
    if not wid:
        raise HTTPException(400, detail="WID cannot be empty.")
    if not checked_by:
        raise HTTPException(400, detail="Operator name cannot be empty.")

    # 1. Lookup the product
    product_stmt = select(Product).where(Product.wid == wid)
    product_result = await db.execute(product_stmt)
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail=f"Product with WID '{wid}' not found in the database.")
        
    # 2. Handle photo saving if provided
    photo_url = None
    if photo:
        # Generate a unique name
        allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
        extension = Path(photo.filename).suffix.lower()
        if extension not in allowed_extensions:
            raise HTTPException(400, detail="Only JPG, PNG, WEBP images allowed.")

        filename = f"{uuid.uuid4()}{extension}"
        
        # Determine full path
        Path(config.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
        save_path = Path(config.UPLOAD_DIR) / filename
        
        # Save file asynchronously
        async with aiofiles.open(save_path, "wb") as buffer:
            while content := await photo.read(1024 * 1024):  # read in 1MB chunks
                await buffer.write(content)
                
        # Store relative URL that can be requested via StaticFiles mount
        photo_url = f"/uploads/{filename}"

    # 3. Create log database record
    log = VerificationLog(
        wid=wid,
        checked_by=checked_by,
        photo_url=photo_url,
        notes=notes
    )
    
    db.add(log)
    await db.commit()
    await db.refresh(log)
    
    return log, product
