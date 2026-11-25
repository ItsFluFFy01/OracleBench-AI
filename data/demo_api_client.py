"""Envoie les rounds du mock à une API lancée (python -m backend.api) et mesure l'erreur.
Usage :  python -m data.demo_api_client [http://127.0.0.1:5000]
Peut être relancé : il reprend après le dernier round déjà enregistré par le serveur."""
import sys

import pandas as pd
import requests

WARMUP = 15      # les premiers rounds servent de démarrage à froid : exclus de la mesure d'erreur

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
    rows.append({"round": int(rid), "truth": body["ground_truth"], "ai": res["final_value"],
                 "conf": res["confidence"], "chain": res["blockchain"]["status"]})

print(f"{len(rows)} rounds envoyés (reprise après le round {start})")
scored = pd.DataFrame(rows, columns=["round", "truth", "ai", "conf", "chain"])
scored = scored[scored["round"] > WARMUP].dropna(subset=["ai"])
if scored.empty:
    print(f"Aucun round à évaluer (il faut des rounds > {WARMUP}). "
          f"Pour repartir de zéro : arrêter le serveur puis définir $env:RUN_ID avec un nouveau nom.")
else:
    err = (scored.ai - scored.truth).abs()
    print(f"Évaluation sur {len(scored)} rounds (round > {WARMUP}) | MAE IA = {err.mean():.3f} | erreur max = {err.max():.3f}")
    print("statuts blockchain :", scored.chain.value_counts().to_dict())
    print("confiance min/médiane/max :", round(scored.conf.min(), 2), round(scored.conf.median(), 2), round(scored.conf.max(), 2))

latest = requests.get(f"{base}/rounds?limit=2", timeout=5).json()
print("derniers rounds :", [(x["round_id"], None if x["final_value"] is None else round(x["final_value"], 2)) for x in latest["rounds"]])
print("réputations :", {k: round(v, 2) for k, v in requests.get(f"{base}/reputation", timeout=5).json()["reputation"].items()})