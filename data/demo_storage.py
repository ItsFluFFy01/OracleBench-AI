"""Rejoue le pipeline sur le mock ET enregistre chaque round dans le stockage Parquet.
Lancer depuis la racine :  python -m data.demo_storage"""
import numpy as np
import pandas as pd

from backend.storage_factory import create_store
from oraclebench.ai_aggregation import aggregate_round
from oraclebench.anomaly_detection import AnomalyDetector
from oraclebench.reputation import ReputationEngine

df = pd.read_csv("data/mock_rounds.csv")
base = df[["round_id", "oracle_id", "value"]]
det = AnomalyDetector()
eng = ReputationEngine(oracle_ids=sorted(df.oracle_id.unique()))
store = create_store(run_id="demo")

for rid, g in df.groupby("round_id"):
    obs = g[["round_id", "oracle_id", "value"]]
    scores = det.score_round(obs, base[base.round_id < rid])
    res = aggregate_round(obs, eng.get(), scores)
    eng.update({o: s >= 0.5 for o, s in scores.items()})
    v = g.value.to_numpy()
    store.save_round(int(rid), res, ground_truth=float(g.ground_truth.iloc[0]),
                     methods={"mean": float(v.mean()), "median": float(np.median(v)), "ai": res["final_value"]})

print("rounds enregistrés :", store.count(), "| dernier round :", store.latest_round_id())
print(store.list_rounds(limit=3, descending=True)[["round_id", "final_value", "confidence", "proof_hash"]].to_string(index=False))
r = store.get_round(120)
print("\nround 120 :", {k: r[k] for k in ("final_value", "confidence", "n_accepted", "ground_truth")})
print("per_oracle :", [(p["oracle_id"], round(p["value"], 1), p["status"]) for p in r["per_oracle"]])