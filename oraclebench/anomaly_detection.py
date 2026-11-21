"""
Détection d'anomalies pour OracleBench-AI (Personne B).

Principe : deux détecteurs complémentaires, combinés par max().
  1. Score statistique robuste (z-score basé sur médiane/MAD, indépendant de l'échelle,
     résiste jusqu'à ~50 % d'oracles défaillants) + règle "valeur figée" (stale).
  2. Isolation Forest sur des features comportementales (écart, mouvement, dynamique
     récente de chaque oracle), entraîné sur une fenêtre glissante de l'historique.

La vérité terrain n'est JAMAIS utilisée ici.

Contrat figé : detect_anomalies(obs_df, history) -> dict[oracle_id, score in [0, 1]]
"""
from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Mapping

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

MAD_TO_STD = 1.4826
REQUIRED_COLS = ("round_id", "oracle_id", "value")
IF_FEATURES = ["abs_z", "move_gap", "roll_abs_z", "roll_std_z", "exceed_rate", "frozen_rate"]


@dataclass
class DetectorConfig:
    window_rounds: int = 60        # taille de l'historique utilisé pour entraîner
    min_history_rounds: int = 15   # en dessous : mode démarrage à froid (stat seul)
    min_oracles: int = 3           # en dessous, la médiane n'a pas de sens
    roll_window: int = 5           # fenêtre des features temporelles par oracle
    refit_every: int = 5           # ré-entraîner l'Isolation Forest tous les k rounds
    n_estimators: int = 100
    min_scale_rel: float = 0.002   # plancher d'échelle relatif à |médiane|
    z_low: float = 2.5             # score stat = 0 en dessous de ce |z|
    z_high: float = 6.0            # score stat = 1 au-dessus de ce |z|
    z_exceed: float = 3.5          # seuil de "dépassement" pour exceed_rate
    if_low: float = 0.60           # score IF brut -> 0
    if_high: float = 0.80          # score IF brut -> 1
    frozen_rule: bool = True       # règle stale (valeur exactement répétée)
    frozen_full: float = 0.3       # frozen_rate à partir duquel le score vaut 1
    seed: int = 42

    @classmethod
    def from_dict(cls, d: Mapping | None) -> "DetectorConfig":
        if not d:
            return cls()
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in names})


def _validate(df: pd.DataFrame, name: str) -> None:
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"{name}: colonnes manquantes {missing}")


def compute_features(df: pd.DataFrame, cfg: DetectorConfig) -> pd.DataFrame:
    """Features par (round, oracle). Aucune utilisation de la vérité terrain.

    df : colonnes round_id, oracle_id, value (plusieurs rounds, valeurs finies).
    """
    d = df[list(REQUIRED_COLS)].copy()
    d["value"] = d["value"].astype(float)

    # --- niveau round : médiane et dispersion robuste -------------------------
    by_round = d.groupby("round_id")["value"]
    d["med"] = by_round.transform("median")
    dev = (d["value"] - d["med"]).abs()
    round_mad = dev.groupby(d["round_id"]).transform("median") * MAD_TO_STD
    typical_mad = float(round_mad.median())
    # plancher adaptatif : évite la division par ~0 quand tous les oracles s'accordent
    d["scale"] = np.maximum.reduce([
        round_mad.to_numpy(),
        np.full(len(d), 0.5 * typical_mad),
        (cfg.min_scale_rel * d["med"].abs()).to_numpy(),
        np.full(len(d), 1e-9),
    ])
    d["z"] = (d["value"] - d["med"]) / d["scale"]
    d["abs_z"] = d["z"].abs()

    # --- features temporelles par oracle --------------------------------------
    d = d.sort_values(["oracle_id", "round_id"]).reset_index(drop=True)
    round_med = d.drop_duplicates("round_id").set_index("round_id")["med"].sort_index()
    d["med_prev"] = d["round_id"].map(round_med.shift(1))
    d["own_delta"] = d.groupby("oracle_id")["value"].diff()
    d["med_delta"] = d["med"] - d["med_prev"]
    d["move_gap"] = ((d["own_delta"] - d["med_delta"]).abs() / d["scale"]).fillna(0.0)
    d["frozen"] = (d["own_delta"].abs() < 1e-9).astype(float)
    d["exceed"] = (d["abs_z"] > cfg.z_exceed).astype(float)

    w = cfg.roll_window
    g = d.groupby("oracle_id")
    d["roll_abs_z"] = g["abs_z"].transform(lambda s: s.rolling(w, min_periods=1).mean())
    d["roll_std_z"] = g["z"].transform(lambda s: s.rolling(w, min_periods=2).std()).fillna(0.0)
    d["exceed_rate"] = g["exceed"].transform(lambda s: s.rolling(w, min_periods=1).mean())
    d["frozen_rate"] = g["frozen"].transform(lambda s: s.rolling(w, min_periods=1).mean())
    return d


class AnomalyDetector:
    """Détecteur à état : mémorise l'Isolation Forest entre les rounds (ré-entraînement
    toutes les `refit_every` rounds) pour rester rapide sur de longues campagnes.
    Créer UNE instance par run d'expérience (reproductibilité)."""

    def __init__(self, cfg: DetectorConfig | Mapping | None = None):
        self.cfg = cfg if isinstance(cfg, DetectorConfig) else DetectorConfig.from_dict(cfg)
        self.reset()

    def reset(self) -> None:
        self._model: IsolationForest | None = None
        self._last_fit_round = None

    # -- scores partiels ------------------------------------------------------
    def _stat_score(self, f: pd.DataFrame) -> np.ndarray:
        c = self.cfg
        s = np.clip((f["abs_z"].to_numpy() - c.z_low) / (c.z_high - c.z_low), 0.0, 1.0)
        if c.frozen_rule:
            # valeur figée CE round-ci, et répétée récemment (évite de punir après la panne)
            fz = np.clip(f["frozen_rate"].to_numpy() / c.frozen_full, 0.0, 1.0) * f["frozen"].to_numpy()
            s = np.maximum(s, fz)
        return s

    def _if_score(self, f: pd.DataFrame) -> np.ndarray:
        raw = -self._model.score_samples(f[IF_FEATURES].to_numpy())   # (0,1), >0.5 = suspect
        c = self.cfg
        return np.clip((raw - c.if_low) / (c.if_high - c.if_low), 0.0, 1.0)

    def _maybe_fit(self, train: pd.DataFrame, round_id) -> None:
        stale = self._model is None or self._last_fit_round is None
        if not stale:
            try:
                stale = (round_id - self._last_fit_round) >= self.cfg.refit_every
            except TypeError:
                stale = True
        if stale:
            self._model = IsolationForest(
                n_estimators=self.cfg.n_estimators, contamination="auto",
                random_state=self.cfg.seed, n_jobs=1,
            ).fit(train[IF_FEATURES].to_numpy())
            self._last_fit_round = round_id

    # -- API principale -------------------------------------------------------
    def score_round(self, obs_df: pd.DataFrame, history: pd.DataFrame | None = None) -> dict:
        _validate(obs_df, "obs_df")
        cur = obs_df[list(REQUIRED_COLS)].copy()
        rid = cur["round_id"].iloc[0]

        finite = np.isfinite(cur["value"].astype(float))
        scores = {o: 1.0 for o in cur.loc[~finite, "oracle_id"]}     # valeur absente/NaN = suspect
        cur = cur[finite]
        if cur["oracle_id"].nunique() < self.cfg.min_oracles:
            scores.update({o: 0.0 for o in cur["oracle_id"]})
            return scores

        hist = pd.DataFrame(columns=list(REQUIRED_COLS))
        if history is not None and len(history):
            _validate(history, "history")
            h = history[list(REQUIRED_COLS)]
            h = h[(h["round_id"] < rid) & np.isfinite(h["value"].astype(float))]
            keep = sorted(h["round_id"].unique())[-self.cfg.window_rounds:]
            hist = h[h["round_id"].isin(keep)]

        feats = compute_features(pd.concat([hist, cur], ignore_index=True), self.cfg)
        cur_f = feats[feats["round_id"] == rid]
        train_f = feats[feats["round_id"] != rid]

        final = self._stat_score(cur_f)
        if train_f["round_id"].nunique() >= self.cfg.min_history_rounds:
            self._maybe_fit(train_f, rid)
            final = np.maximum(final, self._if_score(cur_f))

        scores.update(dict(zip(cur_f["oracle_id"], np.round(final, 4))))
        return scores


def detect_anomalies(obs_df, history=None, detector: AnomalyDetector | None = None,
                     cfg: Mapping | None = None) -> dict:
    """Fonction du contrat. `detector`/`cfg` sont optionnels (rétro-compatible).
    Pour une campagne, passer UN detector réutilisé sur tous les rounds d'un run."""
    det = detector or AnomalyDetector(cfg)
    return det.score_round(obs_df, history)