from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from typing import Optional

class SimpleProductResponse(BaseModel):
    ean: str
    manufacturing_date: date
    expiry_date: date

    model_config = ConfigDict(from_attributes=True)

class VerifyResponse(BaseModel):
    success: bool
    log_id: int
    product: SimpleProductResponse

class ReportResponse(BaseModel):
    id: int
    wid: str
    checked_by: str
    photo_url: Optional[str] = None
    checked_at: datetime
    notes: Optional[str] = None
    
    # Product fields from joined table
    ean: str
    manufacturing_date: date
    expiry_date: date

    model_config = ConfigDict(from_attributes=True)
