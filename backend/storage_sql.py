"""
Stockage off-chain en base SQL : PostgreSQL en production/Docker, SQLite pour les tests.

Deux tables (préfixées pour cohabiter avec d'autres données) :
    oraclebench_rounds        1 ligne par (run_id, round_id)
    oraclebench_observations  1 ligne par (run_id, round_id, oracle_id)

Toutes les requêtes passent par SQLAlchemy Core (paramètres liés, jamais de SQL assemblé
à la main) : pas d'injection SQL possible via run_id ou oracle_id.
Écriture d'un round = UNE transaction (tout ou rien).
"""
from __future__ import annotations

import json

import pandas as pd
import sqlalchemy as sa

from .storage_base import OBS_COLS, ROUND_COLS, BaseRoundStore, validate_run_id

metadata = sa.MetaData()

rounds_t = sa.Table(
    "oraclebench_rounds", metadata,
    sa.Column("run_id", sa.String(64), primary_key=True),
    sa.Column("round_id", sa.BigInteger, primary_key=True),
    sa.Column("timestamp", sa.String(40), nullable=False),
    sa.Column("final_value", sa.Float(53)),
    sa.Column("confidence", sa.Float(53), nullable=False),
    sa.Column("n_accepted", sa.Integer, nullable=False),
    sa.Column("proof_hash", sa.String(66), nullable=False),
    sa.Column("ground_truth", sa.Float(53)),
    sa.Column("methods", sa.JSON, nullable=False),
    sa.Column("breakdown", sa.JSON, nullable=False),
    sa.Column("tx_hash", sa.String(80)),
    sa.Column("gas_used", sa.BigInteger),
    sa.Column("chain_status", sa.String(32)),
)

obs_t = sa.Table(
    "oraclebench_observations", metadata,
    sa.Column("run_id", sa.String(64), primary_key=True),
    sa.Column("round_id", sa.BigInteger, primary_key=True),
    sa.Column("oracle_id", sa.String(64), primary_key=True),
    sa.Column("value", sa.Float(53), nullable=False),
    sa.Column("anomaly_score", sa.Float(53), nullable=False),
    sa.Column("reputation", sa.Float(53), nullable=False),
    sa.Column("status", sa.String(16), nullable=False),
    sa.ForeignKeyConstraint(["run_id", "round_id"],
                            ["oraclebench_rounds.run_id", "oraclebench_rounds.round_id"],
                            ondelete="CASCADE"),
)


def normalize_url(url: str) -> str:
    """Accepte postgres:// et postgresql:// (formats usuels de DATABASE_URL) et force le
    pilote psycopg (v3) installé avec le projet."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


class SqlRoundStore(BaseRoundStore):
    def __init__(self, url: str, run_id: str = "default"):
        self.run_id = validate_run_id(run_id)
        self.engine = sa.create_engine(normalize_url(url), pool_pre_ping=True)
        metadata.create_all(self.engine)      # idempotent : ne touche pas aux tables existantes

    # ------------------------------------------------------------- écriture ---
    def _write(self, row: dict, obs: list[dict]) -> None:
        key = (obs_t.c.run_id == row["run_id"]) & (obs_t.c.round_id == row["round_id"])
        rkey = (rounds_t.c.run_id == row["run_id"]) & (rounds_t.c.round_id == row["round_id"])
        with self.engine.begin() as cx:                      # une transaction : tout ou rien
            cx.execute(sa.delete(obs_t).where(key))
            cx.execute(sa.delete(rounds_t).where(rkey))      # upsert portable : delete + insert
            cx.execute(sa.insert(rounds_t), [row])
            if obs:
                cx.execute(sa.insert(obs_t), obs)

    def update_blockchain(self, round_id, tx_hash, gas_used, chain_status) -> bool:
        with self.engine.begin() as cx:
            res = cx.execute(
                sa.update(rounds_t)
                .where((rounds_t.c.run_id == self.run_id) & (rounds_t.c.round_id == int(round_id)))
                .values(tx_hash=tx_hash, gas_used=gas_used, chain_status=chain_status))
        return res.rowcount > 0

    def delete_run(self) -> None:
        with self.engine.begin() as cx:
            cx.execute(sa.delete(obs_t).where(obs_t.c.run_id == self.run_id))
            cx.execute(sa.delete(rounds_t).where(rounds_t.c.run_id == self.run_id))

    # -------------------------------------------------------------- lecture ---
    def _read(self, round_id: int):
        with self.engine.connect() as cx:
            r = cx.execute(sa.select(rounds_t).where(
                (rounds_t.c.run_id == self.run_id) & (rounds_t.c.round_id == round_id))).mappings().first()
            if r is None:
                return None
            obs = cx.execute(sa.select(obs_t).where(
                (obs_t.c.run_id == self.run_id) & (obs_t.c.round_id == round_id))).mappings().all()
        return dict(r), [dict(o) for o in obs]

    def list_rounds(self, limit=None, descending=False) -> pd.DataFrame:
        order = rounds_t.c.round_id.desc() if descending else rounds_t.c.round_id.asc()
        q = sa.select(rounds_t).where(rounds_t.c.run_id == self.run_id).order_by(order)
        if limit:
            q = q.limit(int(limit))
        with self.engine.connect() as cx:
            df = pd.read_sql(q, cx)
        if df.empty:
            return pd.DataFrame(columns=ROUND_COLS)
        df["methods_json"] = df.pop("methods").map(json.dumps)
        df["breakdown_json"] = df.pop("breakdown").map(json.dumps)
        return df[ROUND_COLS].reset_index(drop=True)

    def load_observations(self, round_id=None) -> pd.DataFrame:
        q = sa.select(obs_t).where(obs_t.c.run_id == self.run_id)
        if round_id is not None:
            q = q.where(obs_t.c.round_id == int(round_id))
        q = q.order_by(obs_t.c.round_id, obs_t.c.oracle_id)
        with self.engine.connect() as cx:
            df = pd.read_sql(q, cx)
        return df[OBS_COLS].reset_index(drop=True) if not df.empty else pd.DataFrame(columns=OBS_COLS)

    def latest_round_id(self):
        with self.engine.connect() as cx:
            v = cx.execute(sa.select(sa.func.max(rounds_t.c.round_id))
                           .where(rounds_t.c.run_id == self.run_id)).scalar()
        return None if v is None else int(v)

    def count(self) -> int:
        with self.engine.connect() as cx:
            return int(cx.execute(sa.select(sa.func.count()).select_from(rounds_t)
                                  .where(rounds_t.c.run_id == self.run_id)).scalar())