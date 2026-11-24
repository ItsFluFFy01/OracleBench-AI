"""
Choix du stockage sans changer le code, par variables d'environnement :

    STORAGE_BACKEND = parquet (défaut) | postgres
    STORAGE_DIR     = dossier Parquet (défaut data/store)
    DATABASE_URL    = postgresql://user:motdepasse@hote:5432/base   (requis pour postgres)
"""
from __future__ import annotations

import os

from .storage_base import BaseRoundStore


def create_store(backend: str | None = None, run_id: str = "default",
                 root: str | None = None, url: str | None = None) -> BaseRoundStore:
    backend = (backend or os.getenv("STORAGE_BACKEND") or "parquet").strip().lower()
    if backend == "parquet":
        from .storage import ParquetRoundStore
        return ParquetRoundStore(root or os.getenv("STORAGE_DIR") or "data/store", run_id)
    if backend in ("postgres", "postgresql", "sql"):
        url = url or os.getenv("DATABASE_URL")
        if not url:
            raise ValueError("DATABASE_URL est requis pour le stockage PostgreSQL")
        from .storage_sql import SqlRoundStore     # import tardif : SQLAlchemy/psycopg seulement si utilisé
        return SqlRoundStore(url, run_id)
    raise ValueError(f"STORAGE_BACKEND inconnu : {backend!r} (parquet ou postgres)")