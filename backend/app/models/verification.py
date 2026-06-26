from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base

class VerificationLog(Base):
    __tablename__ = "verification_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wid = Column(String, ForeignKey("products.wid", ondelete="CASCADE"), nullable=False, index=True)
    checked_by = Column(String, nullable=False)
    photo_url = Column(String, nullable=True)
    checked_at = Column(DateTime(timezone=True), server_default=func.now(), index=True, nullable=False)
    notes = Column(Text, nullable=True)

    # Relationship to Product
    product = relationship("Product", backref="verification_logs", lazy="joined")

    def __repr__(self):
        return f"<VerificationLog(id={self.id}, wid={self.wid}, checked_by={self.checked_by})>"
