"""
Migrate the local ProspectLocal MongoDB database to a remote shared MongoDB
database. The script is intentionally simple and idempotent: documents are
copied collection by collection with upserts on `_id`.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

from dotenv import dotenv_values
from pymongo import MongoClient, ReplaceOne
from pymongo.errors import ServerSelectionTimeoutError


DEFAULT_ENV_PATH = Path(__file__).resolve().parent / "backend" / ".env"
DEFAULT_LOCAL_ENV_PATH = Path(__file__).resolve().parent / "backend" / ".env.local.backup"
DEFAULT_SHARED_ENV_PATH = Path(__file__).resolve().parent / "backend" / ".env.shared"


def load_env(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Fichier .env introuvable : {path}")
    return {key: value for key, value in dotenv_values(path).items() if value is not None}


def iter_business_collections(database) -> Iterable[str]:
    return sorted(
        collection_name
        for collection_name in database.list_collection_names()
        if not collection_name.startswith("system.")
    )


def copy_collection(source_collection, target_collection, batch_size: int = 250) -> int:
    migrated = 0
    batch = []

    for document in source_collection.find({}):
        batch.append(ReplaceOne({"_id": document["_id"]}, document, upsert=True))
        if len(batch) >= batch_size:
            target_collection.bulk_write(batch, ordered=False)
            migrated += len(batch)
            batch.clear()

    if batch:
        target_collection.bulk_write(batch, ordered=False)
        migrated += len(batch)

    return migrated


def main() -> None:
    parser = argparse.ArgumentParser(description="Migre la base ProspectLocal locale vers la base partagée.")
    parser.add_argument("--source-env", default=str(DEFAULT_LOCAL_ENV_PATH), help="Fichier .env source (local).")
    parser.add_argument("--target-env", default=str(DEFAULT_SHARED_ENV_PATH), help="Fichier .env cible (partagé).")
    args = parser.parse_args()

    source_env = load_env(Path(args.source_env))
    target_env = load_env(Path(args.target_env))

    source_url = source_env.get("MONGO_URL")
    target_url = target_env.get("MONGO_URL")
    source_db_name = source_env.get("DB_NAME", "prospectlocal")
    target_db_name = target_env.get("DB_NAME", "prospectlocal")

    if not source_url or not target_url:
        raise RuntimeError("MONGO_URL absent dans le .env source ou cible.")

    source_client = MongoClient(source_url, serverSelectionTimeoutMS=10000, appname="ProspectLocal-Migration-Source")
    target_client = MongoClient(target_url, serverSelectionTimeoutMS=10000, appname="ProspectLocal-Migration-Target")

    # Force an early connection failure if one side is unreachable.
    try:
        source_client.admin.command("ping")
    except ServerSelectionTimeoutError as exc:
        raise RuntimeError(
            "Impossible de joindre la base locale source. Vérifiez que MongoDB local est démarré."
        ) from exc

    try:
        target_client.admin.command("ping")
    except ServerSelectionTimeoutError as exc:
        raise RuntimeError(
            "Impossible de joindre la base MongoDB partagée. Causes probables : cluster Atlas en pause, "
            "IP non autorisée dans Network Access, ou URI invalide."
        ) from exc

    source_db = source_client[source_db_name]
    target_db = target_client[target_db_name]

    print(f"Migration ProspectLocal: {source_db_name} -> {target_db_name}")

    migrated_summary: list[tuple[str, int]] = []

    for collection_name in iter_business_collections(source_db):
        source_collection = source_db[collection_name]
        target_collection = target_db[collection_name]
        migrated = copy_collection(source_collection, target_collection)
        migrated_summary.append((collection_name, migrated))
        print(f"- {collection_name}: {migrated} document(s) migré(s)")

    total_documents = sum(count for _, count in migrated_summary)
    print(f"Migration terminée: {total_documents} document(s) migré(s) sur {len(migrated_summary)} collection(s).")


if __name__ == "__main__":
    main()
