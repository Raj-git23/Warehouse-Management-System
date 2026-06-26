from sqlalchemy import Column, String, Date, DateTime, func
from app.database import Base

class Product(Base):
    __tablename__ = "products"

    wid = Column(String, primary_key=True, unique=True, index=True, nullable=False)
    ean = Column(String, nullable=False)
    manufacturing_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<Product(wid={self.wid}, ean={self.ean})>"
