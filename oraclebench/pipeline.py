"""
Pipeline d'un round (Personne B) : détection -> réputation -> agrégation -> confiance.

C'est l'objet que l'API Flask appelle. Il garde en mémoire l'état qui évolue d'un round
à l'autre (réputations, historique des observations pour le détecteur).

Deux temps, pour ne jamais laisser l'état en avance sur le stockage :
    prepare(round_id, observations) -> calcule le résultat SANS modifier l'état
    commit(prepared)                -> applique l'état (réputation, historique)
L'API fait : prepare -> sauvegarde -> commit. Si la sauvegarde échoue, rien n'a bougé.

La vérité terrain n'entre JAMAIS ici : process/prepare ne l'acceptent pas en paramètre.
Les rounds doivent arriver dans l'ordre strictement croissant (sinon la réputation
serait mise à jour deux fois pour le même round).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

import numpy as np
import pandas as pd

from .ai_aggregation import AggregationConfig, aggregate_round
from .anomaly_detection import AnomalyDetector
from .reputation import ReputationEngine

HIST_COLS = ["round_id", "oracle_id", "value"]


class RoundOrderError(ValueError):
    """Round déjà traité ou antérieur au dernier round traité."""


@dataclass
class Prepared:
    round_id: int
    obs: pd.DataFrame
    result: dict
    flags: dict


def baselines(values, weights=None) -> dict:
    """Valeurs des méthodes de référence (sans filtrage d'anomalies)."""
    v = np.asarray([x for x in values if np.isfinite(x)], dtype=float)
    out = {"mean": None, "median": None, "trimmed": None, "weighted": None}
    if v.size == 0:
        return out
    s = np.sort(v)
    out["mean"] = float(v.mean())
    out["median"] = float(np.median(v))
    out["trimmed"] = float((s[1:-1] if s.size >= 3 else s).mean())
    if weights is not None:
        w = np.asarray(weights, dtype=float)
        out["weighted"] = float(np.average(np.asarray(values, dtype=float), weights=w)) if w.sum() > 0 else None
    return out


class RoundProcessor:
    def __init__(self, cfg: Mapping | None = None):
        cfg = dict(cfg or {})
        self.detector = AnomalyDetector(cfg.get("detector"))
        self.reputation = ReputationEngine(cfg.get("reputation"))
        self.agg_cfg = AggregationConfig.from_dict(cfg.get("aggregation"))
        self.history_rounds = int(cfg.get("history_rounds", 100))
        self._history = pd.DataFrame(columns=HIST_COLS)
        self.last_round_id: int | None = None

    # ------------------------------------------------------------ interne ---
    def _push_history(self, obs: pd.DataFrame) -> None:
        h = pd.concat([self._history, obs[HIST_COLS]], ignore_index=True) if len(self._history) else obs[HIST_COLS].copy()
        keep = sorted(h["round_id"].unique())[-self.history_rounds:]
        self._history = h[h["round_id"].isin(keep)].reset_index(drop=True)

    # --------------------------------------------------------- deux temps ---
    def prepare(self, round_id: int, observations) -> Prepared:
        round_id = int(round_id)
        if self.last_round_id is not None and round_id <= self.last_round_id:
            raise RoundOrderError(f"round_id {round_id} <= dernier round traité ({self.last_round_id})")
        obs = pd.DataFrame(observations)[["oracle_id", "value"]].copy()
        if obs["oracle_id"].duplicated().any():
            raise ValueError("oracle_id en double dans un même round")
        obs["round_id"] = round_id

        scores = self.detector.score_round(obs, self._history)
        rep = self.reputation.get()                      # réputation AVANT ce round
        result = aggregate_round(obs, rep, scores, self.agg_cfg)

        values = list(obs["value"])
        w = [rep.get(o, self.agg_cfg.default_rep) for o in obs["oracle_id"]]
        result["methods"] = {**baselines(values, w), "ai": result["final_value"]}
        flags = {p["oracle_id"]: p["status"] == "ALERT" for p in result["per_oracle"]}
        return Prepared(round_id, obs, result, flags)

    def commit(self, p: Prepared) -> None:
        self.reputation.update(p.flags)
        self._push_history(p.obs)
        self.last_round_id = p.round_id

    def process(self, round_id: int, observations) -> dict:
        p = self.prepare(round_id, observations)
        self.commit(p)
        return p.result

    # ------------------------------------------------------ redémarrage ---
    def restore_from_store(self, store) -> int:
        """Reconstruit réputation et historique en rejouant les rounds déjà stockés
        (les statuts ALERT/NORMAL stockés donnent exactement les signalements d'origine).
        Renvoie le nombre de rounds rejoués."""
        obs = store.load_observations()
        n = 0
        for rid, g in obs.groupby("round_id", sort=True):
            self.reputation.update({o: s == "ALERT" for o, s in zip(g["oracle_id"], g["status"])})
            self._push_history(g[HIST_COLS].assign(round_id=int(rid)))
            self.last_round_id = int(rid)
            n += 1
        return n