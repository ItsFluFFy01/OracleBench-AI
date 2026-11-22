"""
Agrégation « intelligente » : filtrage par anomalie + moyenne pondérée par réputation.

Étapes d'un round :
  1. flags      = {oracle: score_anomalie >= anomaly_threshold}
  2. acceptés   = oracles non signalés, valeur finie
  3. valeur     = moyenne des acceptés pondérée par leur réputation
  4. confiance  = compute_confidence(...)   (voir confidence.py)

Cas limites (documentés, testés) :
  - aucun oracle accepté          -> repli sur la médiane de tous, confiance 0
  - tous les acceptés à réputation 0 -> repli sur la moyenne simple des acceptés, confiance 0
  - aucune valeur exploitable     -> (NaN, 0.0)

Contrat figé : ai_aggregate(obs_df, rep, scores, cfg) -> (value, confidence)
"""
from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Mapping

import numpy as np
import pandas as pd

from .confidence import ConfidenceConfig, confidence_breakdown


@dataclass
class AggregationConfig:
    anomaly_threshold: float = 0.5   # score >= seuil -> oracle écarté
    default_rep: float = 0.5         # réputation supposée d'un oracle inconnu
    soft_weighting: bool = False     # True : poids = réputation * (1 - score)
    confidence: dict | None = None   # réglages de ConfidenceConfig (optionnel)

    def __post_init__(self):
        if not (0.0 < self.anomaly_threshold <= 1.0):
            raise ValueError("anomaly_threshold doit être dans ]0, 1]")

    @classmethod
    def from_dict(cls, d: Mapping | None) -> "AggregationConfig":
        if not d:
            return cls()
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in names})


def _as_cfg(cfg) -> AggregationConfig:
    return cfg if isinstance(cfg, AggregationConfig) else AggregationConfig.from_dict(cfg)


def aggregate_round(obs_df: pd.DataFrame, rep: Mapping, scores: Mapping, cfg=None) -> dict:
    """Agrège un round et renvoie un résultat détaillé, aligné sur round_result.schema.json :
    {final_value, confidence, per_oracle[{oracle_id, value, anomaly_score, reputation, status}],
     n_accepted, breakdown}."""
    c = _as_cfg(cfg)
    for col in ("oracle_id", "value"):
        if col not in obs_df.columns:
            raise ValueError(f"obs_df: colonne manquante {col!r}")

    values = {o: float(v) for o, v in zip(obs_df["oracle_id"], obs_df["value"])}
    finite = {o: v for o, v in values.items() if np.isfinite(v)}
    score = {o: float(scores.get(o, 0.0)) for o in values}
    flags = {o: (score[o] >= c.anomaly_threshold) or (o not in finite) for o in values}
    repu = {o: float(min(1.0, max(0.0, rep.get(o, c.default_rep)))) for o in values}

    accepted = [o for o in finite if not flags[o]]
    breakdown = confidence_breakdown(finite, repu, flags, ConfidenceConfig.from_dict(c.confidence))

    if not finite:
        final = float("nan")
    elif not accepted:
        final = float(np.median(list(finite.values())))          # repli : médiane de tous
    else:
        if c.soft_weighting:
            w = np.array([repu[o] * (1.0 - min(1.0, score[o])) for o in accepted])
        else:
            w = np.array([repu[o] for o in accepted])
        v = np.array([finite[o] for o in accepted])
        final = float(np.average(v, weights=w)) if w.sum() > 0 else float(v.mean())

    per_oracle = [{"oracle_id": o, "value": values[o], "anomaly_score": score[o],
                   "reputation": repu[o], "status": "ALERT" if flags[o] else "NORMAL"}
                  for o in values]
    return {"final_value": final, "confidence": breakdown["confidence"],
            "per_oracle": per_oracle, "n_accepted": len(accepted), "breakdown": breakdown}


def ai_aggregate(obs_df: pd.DataFrame, rep: Mapping, scores: Mapping, cfg=None) -> tuple:
    """Fonction du contrat : (valeur agrégée, score de confiance)."""
    r = aggregate_round(obs_df, rep, scores, cfg)
    return r["final_value"], r["confidence"]