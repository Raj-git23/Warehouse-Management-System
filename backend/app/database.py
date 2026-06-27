from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from app import config

# Create the async engine. We use the postgresql+asyncpg driver.
engine = create_async_engine(
    config.DATABASE_URL,
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=5,
)

# Create the async session factory.
SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Declarative base class for models
Base = declarative_base()

async def get_db():
    """Dependency that yields a new async SQLAlchemy session."""
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
