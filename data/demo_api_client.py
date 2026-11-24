"""Envoie les rounds du mock à une API lancée (python -m backend.api) et mesure l'erreur.
Usage :  python -m data.demo_api_client [http://127.0.0.1:5000]"""
import sys

import numpy as np
import pandas as pd
import requests

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5000"
df = pd.read_csv("data/mock_rounds.csv")
start = requests.get(f"{base}/health", timeout=5).json()["latest_round_id"] or 0

rows = []
for rid, g in df[df.round_id > start].groupby("round_id"):
    body = {"round_id": int(rid), "ground_truth": float(g.ground_truth.iloc[0]),
            "observations": [{"oracle_id": o, "value": float(v)} for o, v in zip(g.oracle_id, g.value)]}
    r = requests.post(f"{base}/round", json=body, timeout=10)
    r.raise_for_status()
    res = r.json()
    rows.append({"round": rid, "truth": body["ground_truth"], "ai": res["final_value"],
                 "conf": res["confidence"], "chain": res["blockchain"]["status"]})

r = pd.DataFrame(rows).query("round > 15")
err = (r.ai - r.truth).abs()
print(f"{len(rows)} rounds envoyés | MAE IA = {err.mean():.3f} | erreur max = {err.max():.3f}")
print("statuts blockchain :", r.chain.value_counts().to_dict())
print("confiance min/médiane/max :", r.conf.min().round(2), r.conf.median().round(2), r.conf.max().round(2))
latest = requests.get(f"{base}/rounds?limit=2", timeout=5).json()
print("derniers rounds :", [(x["round_id"], round(x["final_value"], 2)) for x in latest["rounds"]])
print("réputations :", {k: round(v, 2) for k, v in requests.get(f"{base}/reputation", timeout=5).json()["reputation"].items()})
