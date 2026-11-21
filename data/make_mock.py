import numpy as np
import pandas as pd

rng = np.random.default_rng(42)

# profil de chaque oracle (10 oracles)
PROFILES = {
    "O01": "normal", "O02": "normal", "O03": "normal", "O04": "normal",
    "O05": "normal", "O06": "noisy",
    "O07": "biased", "O08": "spike", "O09": "stale", "O10": "collusion",
}
# collusion : O10 + O03 donnent la même fausse valeur
COLLUDERS = ["O03", "O10"]

rows, last_good = [], {}
for r in range(1, 201):
    truth = 100 + 5 * np.sin(r / 10)
    collusion_active = 100 <= r <= 150           # collusion sur une période
    fake = truth + 40

    for oid, prof in PROFILES.items():
        value, bad = truth + rng.normal(0, 0.5), 0

        if prof == "noisy":
            value, bad = truth + rng.normal(0, 4), int(True)
        elif prof == "biased":
            value, bad = truth + 15 + rng.normal(0, 0.5), 1
        elif prof == "spike" and rng.random() < 0.1:       # 10% des rounds
            value, bad = truth + 300, 1
        elif prof == "stale" and r > 60 and r % 20 < 8:    # répète l'ancienne valeur
            value, bad = last_good.get(oid, value), 1

        if collusion_active and oid in COLLUDERS:
            value, bad = fake + rng.normal(0, 0.1), 1

        if bad == 0:
            last_good[oid] = value
        rows.append((r, oid, round(value, 3), round(truth, 3), bad, PROFILES[oid]))

df = pd.DataFrame(rows, columns=["round_id", "oracle_id", "value", "ground_truth", "is_bad", "profile"])
df.to_csv("data/mock_rounds.csv", index=False)
print(df.shape, "| mauvais:", int(df["is_bad"].sum()))
print(df.groupby("profile")["is_bad"].mean().round(2))