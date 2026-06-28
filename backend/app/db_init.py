import asyncpg
import threading
from pathlib import Path
from sqlalchemy.engine.url import make_url
from alembic.config import Config
from alembic import command
from app import config

async def create_db_if_not_exists(database_url: str):
    """
    Checks if the target database exists. If not, attempts to connect to the 
    default 'postgres' database and create it.
    """
    try:
        url = make_url(database_url)
    except Exception as e:
        print(f"Error parsing database URL: {e}")
        return

    # If database is postgres or not specified, no action is needed
    if not url.database or url.database == "postgres":
        return

    try:
        conn_args = {
            "database": "postgres",
            "host": url.host or "localhost",
            "port": url.port or 5432,
            "user": url.username or "postgres",
        }
        if url.password:
            conn_args["password"] = url.password

        # Connect to default database server
        conn = await asyncpg.connect(**conn_args)
        try:
            exists = await conn.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = $1", url.database
            )
            if not exists:
                print(f"Database '{url.database}' does not exist. Creating it automatically...")
                safe_db_name = url.database.replace('"', '""')
                await conn.execute(f'CREATE DATABASE "{safe_db_name}"')
                print(f"Database '{url.database}' created successfully.")
        finally:
            await conn.close()
    except Exception as e:
        # Silently log and ignore database creation errors since we might be on a restricted-access 
        # database (e.g. Supabase, hosting provider) where we can't connect to postgres or create databases.
        print(f"Notice: Automated database creation skipped or failed (might already exist or restricted permissions): {e}")

def run_migrations():
    """
    Runs Alembic database migrations programmatically.
    """
    try:
        base_dir = Path(__file__).resolve().parent.parent
        alembic_ini_path = str(base_dir / "alembic.ini")
        migrations_dir = str(base_dir / "migrations")

        alembic_cfg = Config(alembic_ini_path)
        alembic_cfg.set_main_option("script_location", migrations_dir)
        
        command.upgrade(alembic_cfg, "head")
        print("Database migrations applied successfully.")
    except Exception as e:
        print(f"Failed to run database migrations automatically: {e}")

async def init_database():
    """
    Automates the entire database setup flow on application startup:
    1. Checks and creates the database if missing.
    2. Runs Alembic migrations to apply latest schema.
    """
    await create_db_if_not_exists(config.DATABASE_URL)
    
    # Run Alembic migrations inside a separate thread to avoid event loop conflicts in env.py
    migration_thread = threading.Thread(target=run_migrations)
    migration_thread.start()
    migration_thread.join()
