from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import uvicorn

from app import config
from app.database import get_db, engine
from app.routes.upload import router as upload_router
from app.routes.verify import router as verify_router
from app.routes.reports import router as reports_router

app = FastAPI(
    title="Product Verification System API",
    description="Backend API for warehouse product verification operations",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure uploads directory is mounted to serve verification photos static files
app.mount("/uploads", StaticFiles(directory=str(config.UPLOAD_DIR)), name="uploads")

# Health check endpoint
@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        # Perform a fast query to check DB connectivity
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "db": "connected"
        }
    except Exception as e:
        return {
            "status": "error",
            "db": "disconnected",
            "error": str(e)
        }

# Register API routers with the /api prefix
app.include_router(upload_router, prefix="/api", tags=["CSV Upload"])
app.include_router(verify_router, prefix="/api", tags=["Product Verification"])
app.include_router(reports_router, prefix="/api", tags=["Verification Reports"])

# Clean shutdown handler to dispose of engine connections
@app.on_event("shutdown")
async def shutdown_event():
    await engine.dispose()

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=True
    )
