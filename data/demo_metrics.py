import pandas as pd
from oraclebench.metrics_detection import (
    replay_detector, threshold_sweep, per_group_rate, latency_summary,
)

df = pd.read_csv("data/mock_rounds.csv")
out, lat = replay_detector(df)

print(threshold_sweep(out["is_bad"], out["score"], [0.3, 0.5, 0.7]).round(3).to_string(index=False))
print(per_group_rate(out))
print({k: round(v, 1) for k, v in latency_summary(lat).items()})