from pydantic import BaseModel, ConfigDict
from datetime import date, datetime

class ProductBase(BaseModel):
    wid: str
    ean: str
    manufacturing_date: date
    expiry_date: date

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
