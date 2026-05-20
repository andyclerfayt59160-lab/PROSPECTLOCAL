"""
Shared dependencies for FastAPI routers.
This module provides database access and other shared resources.
"""
from motor.motor_asyncio import AsyncIOMotorClient
import os

# MongoDB connection - initialized once
_client = None
_db = None


def get_database():
    """Get database instance (lazy initialization)"""
    global _client, _db
    if _db is None:
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'prospectlocal')
        _client = AsyncIOMotorClient(mongo_url)
        _db = _client[db_name]
    return _db


async def get_db():
    """FastAPI dependency for database access"""
    return get_database()
