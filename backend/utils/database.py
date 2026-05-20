"""
Database configuration and shared resources.
This module provides the MongoDB connection that can be imported by all other modules.
"""
import os
from urllib.parse import urlparse
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB connection shared across the backend. The values can target
# either a local MongoDB instance or a remote shared cluster, which makes
# it possible to run the same dataset on multiple devices.
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "prospectlocal")

# Keep the client configuration explicit so desktop and shared-cloud
# deployments behave the same way and fail fast when the database is
# unreachable.
client = AsyncIOMotorClient(
    MONGO_URL,
    serverSelectionTimeoutMS=10000,
    connectTimeoutMS=10000,
    socketTimeoutMS=20000,
    appname="ProspectLocal",
)
db = client[DB_NAME]

# Collections shortcuts
users = db.users
scans = db.scans
businesses = db.businesses
activities = db.activities
notifications = db.notifications
surveillance_zones = db.surveillance_zones
surveillance_alerts = db.surveillance_alerts
api_usage_logs = db.api_usage_logs
api_budget_configs = db.api_budget_configs
user_business_status = db.user_business_status
interactions = db.interactions
visites = db.visites
visite_businesses = db.visite_businesses


def get_database_runtime_status() -> dict:
    """Describe whether the app is using a local or shared MongoDB target."""
    mongo_url = MONGO_URL
    parsed = urlparse(mongo_url)
    netloc = parsed.netloc or parsed.path
    host = netloc.split("@", 1)[-1] if netloc else "unknown"
    is_local = any(local_host in host for local_host in ("localhost", "127.0.0.1"))
    is_shared = mongo_url.startswith("mongodb+srv://") or (host and not is_local and host != "unknown")

    if is_local:
        mode = "local"
        label = "Base locale"
        description = "L'application utilise la base MongoDB du poste local."
    elif is_shared:
        mode = "shared"
        label = "Base partagee"
        description = "L'application utilise une base MongoDB distante partagee."
    else:
        mode = "custom"
        label = "Base personnalisee"
        description = "L'application utilise une configuration MongoDB personnalisee."

    return {
        "mode": mode,
        "label": label,
        "description": description,
        "target": host,
        "database_name": DB_NAME,
    }
