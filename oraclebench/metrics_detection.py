"""
Métriques de détection (Personne B) : Precision, Recall, F1, FPR, AUC, latence.

Convention : y_true = 1 si l'oracle est mauvais, 0 sinon. "Positif" = oracle détecté suspect.
La vérité (y_true) ne sert qu'à ÉVALUER, jamais à détecter.
"""
from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Iterable, Mapping

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

from .anomaly_detection import AnomalyDetector


def _safe_div(a: float, b: float) -> float:
    return float(a) / float(b) if b else float("nan")


def detection_metrics(y_true, y_pred) -> dict:
    """Matrice de confusion + Precision, Recall, F1, FPR.
    Renvoie NaN quand une métrique n'est pas définie (ex. aucun positif réel)."""
    t = np.asarray(y_true).astype(int)
    p = np.asarray(y_pred).astype(int)
    if t.shape != p.shape:
        raise ValueError("y_true et y_pred doivent avoir la même taille")
    tp = int(((t == 1) & (p == 1)).sum())
    fp = int(((t == 0) & (p == 1)).sum())
    tn = int(((t == 0) & (p == 0)).sum())
    fn = int(((t == 1) & (p == 0)).sum())
    precision = _safe_div(tp, tp + fp)
    recall = _safe_div(tp, tp + fn)
    f1 = _safe_div(2 * tp, 2 * tp + fp + fn)
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn,
            "precision": precision, "recall": recall, "f1": f1,
            "fpr": _safe_div(fp, fp + tn)}


def evaluate_scores(y_true, scores, threshold: float = 0.5) -> dict:
    """Métriques à un seuil donné + AUC (indépendante du seuil)."""
    t = np.asarray(y_true).astype(int)
    s = np.asarray(scores, dtype=float)
    out = detection_metrics(t, s >= threshold)
    out["threshold"] = threshold
    out["auc"] = float(roc_auc_score(t, s)) if 0 < t.sum() < len(t) else float("nan")
    return out


def threshold_sweep(y_true, scores, thresholds: Iterable[float] | None = None) -> pd.DataFrame:
    """Une ligne par seuil : permet de choisir le seuil et de tracer la courbe."""
    if thresholds is None:
        thresholds = np.round(np.arange(0.1, 0.95, 0.05), 2)
    rows = [evaluate_scores(y_true, scores, th) for th in thresholds]
    return pd.DataFrame(rows)[["threshold", "precision", "recall", "f1", "fpr", "tp", "fp", "tn", "fn", "auc"]]


def best_threshold(sweep: pd.DataFrame, max_fpr: float | None = None) -> float:
    """Seuil au meilleur F1 (option : sous une contrainte de FPR).
    À choisir sur des seeds de VALIDATION, puis à figer pour les seeds de test."""
    s = sweep.dropna(subset=["f1"])
    if max_fpr is not None:
        s = s[s["fpr"] <= max_fpr]
    if s.empty:
        raise ValueError("aucun seuil ne satisfait la contrainte")
    return float(s.loc[s["f1"].idxmax(), "threshold"])


def per_group_rate(df: pd.DataFrame, group: str = "profile", threshold: float = 0.5) -> pd.DataFrame:
    """Part d'observations flaggées par profil (df : colonnes group, score, is_bad)."""
    g = df.assign(flag=df["score"] >= threshold).groupby(group)
    return pd.DataFrame({"flagged": g["flag"].mean(), "truly_bad": g["is_bad"].mean()}).round(3)


# ---------------------------------------------------------------- latence ---
@contextmanager
def timer(store: list | None = None):
    """with timer(latences): ...  -> ajoute la durée (en ms) dans la liste."""
    t0 = time.perf_counter()
    try:
        yield
    finally:
        if store is not None:
            store.append((time.perf_counter() - t0) * 1000.0)


def latency_summary(latencies_ms: Iterable[float]) -> dict:
    a = np.asarray(list(latencies_ms), dtype=float)
    if a.size == 0:
        return {"n": 0, "mean_ms": float("nan"), "p50_ms": float("nan"), "p95_ms": float("nan")}
    return {"n": int(a.size), "mean_ms": float(a.mean()),
            "p50_ms": float(np.percentile(a, 50)), "p95_ms": float(np.percentile(a, 95))}


# ------------------------------------------------------------------ rejeu ---
def replay_detector(df: pd.DataFrame, cfg: Mapping | None = None, warmup: int = 15):
    """Rejoue un détecteur round par round sur un DataFrame (round_id, oracle_id, value, is_bad).
    Pas de fuite du futur : à chaque round, seul le passé est donné au détecteur.
    Renvoie (DataFrame avec colonne `score`, liste des latences en ms par round).
    Les rounds <= warmup sont exclus (démarrage à froid)."""
    det = AnomalyDetector(cfg)
    base = df[["round_id", "oracle_id", "value"]]
    parts, lat = [], []
    for rid, g in base.groupby("round_id", sort=True):
        past = base[base["round_id"] < rid]
        with timer(lat):
            s = det.score_round(g, past)
        parts.append(pd.DataFrame({"round_id": rid, "oracle_id": list(s), "score": list(s.values())}))
    out = pd.concat(parts, ignore_index=True).merge(df, on=["round_id", "oracle_id"])
    return out[out["round_id"] > warmup].reset_index(drop=True), lat