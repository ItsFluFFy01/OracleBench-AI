"""Rejoue tout le pipeline de B sur le mock et compare la valeur finale aux baselines.
Lancer depuis la racine :  python -m data.demo_aggregation"""
import numpy as np
import pandas as pd

from oraclebench.ai_aggregation import aggregate_round
from oraclebench.anomaly_detection import AnomalyDetector
from oraclebench.reputation import ReputationEngine

df = pd.read_csv("data/mock_rounds.csv")
det = AnomalyDetector()
eng = ReputationEngine(oracle_ids=sorted(df.oracle_id.unique()))
base = df[["round_id", "oracle_id", "value"]]

rows = []
for rid, g in df.groupby("round_id"):
    obs = g[["round_id", "oracle_id", "value"]]
    scores = det.score_round(obs, base[base.round_id < rid])
    rep = eng.get()                                    # réputation AVANT ce round
    res = aggregate_round(obs, rep, scores)
    eng.update({o: s >= 0.5 for o, s in scores.items()})
    v = np.sort(g.value.to_numpy())
    truth = float(g.ground_truth.iloc[0])
    rows.append({"round": rid, "truth": truth, "conf": res["confidence"],
                 "mean": v.mean(), "median": np.median(v), "trimmed": v[1:-1].mean(),
                 "ai": res["final_value"]})

r = pd.DataFrame(rows).query("round > 15")
summary = {}
for m in ["mean", "median", "trimmed", "ai"]:
    err = r[m] - r["truth"]
    summary[m] = {"MAE": err.abs().mean(), "RMSE": float(np.sqrt((err ** 2).mean())),
                  "erreur_max": err.abs().max()}
print(pd.DataFrame(summary).T.round(3))
print("confiance min/médiane/max:", r.conf.min().round(2), r.conf.median().round(2), r.conf.max().round(2))