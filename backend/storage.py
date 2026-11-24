"""
Stockage off-chain en fichiers Parquet : un fichier par round.

Pourquoi un fichier par round : écriture atomique, pas de réécriture de l'historique,
pas de verrou nécessaire, relecture d'un round instantanée, relecture de tout via un dossier.

    <root>/<run_id>/rounds/round_000123.parquet         1 ligne  : résultat du round
    <root>/<run_id>/observations/round_000123.parquet   N lignes : une par oracle

Alternative PostgreSQL : voir backend/storage_sql.py ; choix par backend/storage_factory.py.
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import pandas as pd

from .storage_base import (  # noqa: F401  (réexportés : anciens imports)
    OBS_COLS, ROUND_COLS, BaseRoundStore, compute_proof_hash, validate_run_id,
)


def _atomic_write(df: pd.DataFrame, path: Path) -> None:
    tmp = path.with_name(f".{path.name}.tmp")     # préfixe '.' : ignoré à la lecture du dossier
    df.to_parquet(tmp, index=False)
    os.replace(tmp, path)


class ParquetRoundStore(BaseRoundStore):
    def __init__(self, root: str | Path = "data/store", run_id: str = "default"):
        self.run_id = validate_run_id(run_id)
        self.base = Path(root) / run_id
        self._rounds = self.base / "rounds"
        self._obs = self.base / "observations"
        self._rounds.mkdir(parents=True, exist_ok=True)
        self._obs.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _name(round_id: int) -> str:
        return f"round_{int(round_id):06d}.parquet"

    # ------------------------------------------------------------- écriture ---
    def _write(self, row: dict, obs: list[dict]) -> None:
        r = {k: v for k, v in row.items() if k not in ("methods", "breakdown")}
        r["methods_json"] = json.dumps(row["methods"])
        r["breakdown_json"] = json.dumps(row["breakdown"])
        name = self._name(row["round_id"])
        _atomic_write(pd.DataFrame(obs, columns=OBS_COLS), self._obs / name)
        _atomic_write(pd.DataFrame([r], columns=ROUND_COLS), self._rounds / name)

    def update_blockchain(self, round_id, tx_hash, gas_used, chain_status) -> bool:
        p = self._rounds / self._name(round_id)
        if not p.exists():
            return False
        df = pd.read_parquet(p)
        df = df.astype({"tx_hash": "object", "gas_used": "object", "chain_status": "object"})
        df.loc[0, ["tx_hash", "gas_used", "chain_status"]] = [tx_hash, gas_used, chain_status]
        _atomic_write(df, p)
        return True

    def delete_run(self) -> None:
        shutil.rmtree(self.base, ignore_errors=True)

    # -------------------------------------------------------------- lecture ---
    def _read(self, round_id: int):
        p = self._rounds / self._name(round_id)
        if not p.exists():
            return None
        r = pd.read_parquet(p).iloc[0].to_dict()
        r["methods"] = json.loads(r.pop("methods_json"))
        r["breakdown"] = json.loads(r.pop("breakdown_json"))
        obs = pd.read_parquet(self._obs / self._name(round_id)).to_dict("records")
        return r, obs

    def _read_dir(self, d: Path, cols: list[str]) -> pd.DataFrame:
        if not any(d.glob("round_*.parquet")):
            return pd.DataFrame(columns=cols)
        return pd.read_parquet(d)

    def list_rounds(self, limit=None, descending=False) -> pd.DataFrame:
        df = self._read_dir(self._rounds, ROUND_COLS).sort_values("round_id", ascending=not descending)
        return df.head(limit).reset_index(drop=True) if limit else df.reset_index(drop=True)

    def load_observations(self, round_id=None) -> pd.DataFrame:
        if round_id is not None:
            p = self._obs / self._name(round_id)
            return pd.read_parquet(p) if p.exists() else pd.DataFrame(columns=OBS_COLS)
        return self._read_dir(self._obs, OBS_COLS).sort_values(["round_id", "oracle_id"]).reset_index(drop=True)

    def latest_round_id(self):
        ids = [int(p.stem.split("_")[1]) for p in self._rounds.glob("round_*.parquet")]
        return max(ids) if ids else None

    def count(self) -> int:
        return sum(1 for _ in self._rounds.glob("round_*.parquet"))


RoundStore = ParquetRoundStore   # compatibilité avec le code déjà écrit