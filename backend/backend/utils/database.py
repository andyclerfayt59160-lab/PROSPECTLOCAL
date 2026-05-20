"""
Database configuration and shared resources.
This module provides the MongoDB connection that can be imported by all other modules.
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB Connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "prospectlocal")

# Create MongoDB client
client = AsyncIOMotorClient(MONGO_URL)
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
