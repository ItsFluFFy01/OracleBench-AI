"""
Socle commun du stockage off-chain (Personne B).

Deux implémentations interchangeables :
  - ParquetRoundStore (backend/storage.py)      : fichiers, aucun serveur à installer
  - SqlRoundStore     (backend/storage_sql.py)  : PostgreSQL (ou SQLite pour les tests)
Le reste du projet (API Flask, dashboard, campagne) ne parle qu'à BaseRoundStore.

La blockchain ne reçoit que (round_id, final_value, confidence, proof_hash) ; le détail
reste hors chaîne. `proof_hash` (SHA-256 des observations) permet de prouver plus tard que
le détail stocké ici est bien celui qui a produit la valeur enregistrée on-chain.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone

import pandas as pd

_RUN_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
ROUND_COLS = ["run_id", "round_id", "timestamp", "final_value", "confidence", "n_accepted",
              "proof_hash", "ground_truth", "methods_json", "breakdown_json",
              "tx_hash", "gas_used", "chain_status"]
OBS_COLS = ["run_id", "round_id", "oracle_id", "value", "anomaly_score", "reputation", "status"]


def validate_run_id(run_id: str) -> str:
    if not isinstance(run_id, str) or not _RUN_ID_RE.match(run_id):
        raise ValueError("run_id invalide : 1 à 64 caractères parmi lettres, chiffres, _ et -")
    return run_id


def compute_proof_hash(round_id: int, per_oracle: list[dict]) -> str:
    """SHA-256 déterministe (bytes32 hex, préfixe 0x) des observations d'un round.
    Indépendant de l'ordre des oracles ; ne dépend que de (round_id, oracle_id, value)."""
    obs = sorted([str(p["oracle_id"]), float(p["value"])] for p in per_oracle)
    payload = json.dumps({"round_id": int(round_id), "obs": obs},
                         sort_keys=True, separators=(",", ":"), allow_nan=True)
    return "0x" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def json_safe(x):
    """NaN/inf -> None (JSON strict pour Flask et le dashboard)."""
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if isinstance(x, dict):
        return {k: json_safe(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [json_safe(v) for v in x]
    return x


def _nn(v):
    """Valeur « manquante » (None, NaN, pd.NA) -> None ; sinon la valeur."""
    if v is None:
        return None
    if isinstance(v, (dict, list, str)):
        return v
    return None if pd.isna(v) else v


class BaseRoundStore(ABC):
    run_id: str

    # ------------------------------------------------------- écriture (commun) ---
    def save_round(self, round_id: int, result: dict, ground_truth: float | None = None,
                   methods: dict | None = None, timestamp: str | None = None) -> dict:
        """Enregistre (ou remplace) un round. `result` = sortie de aggregate_round.
        Renvoie la ligne stockée (avec proof_hash)."""
        round_id = int(round_id)
        per = result["per_oracle"]
        row = {
            "run_id": self.run_id, "round_id": round_id,
            "timestamp": timestamp or datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "final_value": float(result["final_value"]), "confidence": float(result["confidence"]),
            "n_accepted": int(result.get("n_accepted", 0)),
            "proof_hash": compute_proof_hash(round_id, per),
            "ground_truth": None if ground_truth is None else float(ground_truth),
            "methods": json_safe(methods or {}), "breakdown": json_safe(result.get("breakdown", {})),
            "tx_hash": None, "gas_used": None, "chain_status": None,
        }
        obs = [{"run_id": self.run_id, "round_id": round_id, "oracle_id": str(p["oracle_id"]),
                "value": float(p["value"]), "anomaly_score": float(p["anomaly_score"]),
                "reputation": float(p["reputation"]), "status": str(p["status"])} for p in per]
        self._write(row, obs)
        return row

    # --------------------------------------------------------- lecture (commun) ---
    def get_round(self, round_id: int) -> dict | None:
        """Round complet au format round_result (JSON-safe), ou None s'il n'existe pas."""
        found = self._read(int(round_id))
        if found is None:
            return None
        r, obs = found
        fv, gt, gas = _nn(r["final_value"]), _nn(r["ground_truth"]), _nn(r["gas_used"])
        out = {
            "round_id": int(r["round_id"]), "timestamp": r["timestamp"],
            "final_value": None if fv is None else float(fv), "confidence": float(r["confidence"]),
            "n_accepted": int(r["n_accepted"]), "proof_hash": r["proof_hash"],
            "ground_truth": None if gt is None else float(gt),
            "methods": r["methods"], "breakdown": r["breakdown"],
            "blockchain": {"tx_hash": _nn(r["tx_hash"]), "gas_used": None if gas is None else int(gas),
                           "status": _nn(r["chain_status"])},
            "per_oracle": [{"oracle_id": o["oracle_id"], "value": float(o["value"]),
                            "anomaly_score": float(o["anomaly_score"]),
                            "reputation": float(o["reputation"]), "status": o["status"]}
                           for o in sorted(obs, key=lambda o: o["oracle_id"])],
        }
        return json_safe(out)

    # ------------------------------------------------------ à implémenter ---
    @abstractmethod
    def _write(self, row: dict, obs: list[dict]) -> None: ...

    @abstractmethod
    def _read(self, round_id: int) -> tuple[dict, list[dict]] | None: ...

    @abstractmethod
    def update_blockchain(self, round_id: int, tx_hash: str | None, gas_used: int | None,
                          chain_status: str) -> bool:
        """Complète un round avec la réponse du pont blockchain. False si le round n'existe pas."""

    @abstractmethod
    def list_rounds(self, limit: int | None = None, descending: bool = False) -> pd.DataFrame: ...

    @abstractmethod
    def load_observations(self, round_id: int | None = None) -> pd.DataFrame: ...

    @abstractmethod
    def latest_round_id(self) -> int | None: ...

    @abstractmethod
    def count(self) -> int: ...

    @abstractmethod
    def delete_run(self) -> None:
        """Supprime TOUTES les données de ce run_id (et seulement celui-ci)."""