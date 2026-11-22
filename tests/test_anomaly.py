import numpy as np
import pandas as pd
import pytest

from oraclebench.anomaly_detection import AnomalyDetector, detect_anomalies


def make_history(n_rounds=30, n_oracles=6, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for r in range(1, n_rounds + 1):
        truth = 100 + 5 * np.sin(r / 10)
        for i in range(1, n_oracles + 1):
            rows.append((r, f"O{i:02d}", truth + rng.normal(0, 0.5)))
    return pd.DataFrame(rows, columns=["round_id", "oracle_id", "value"])


def round_df(round_id, values):
    return pd.DataFrame({"round_id": round_id,
                         "oracle_id": [f"O{i+1:02d}" for i in range(len(values))],
                         "value": values})


def test_spike_is_detected_and_clean_oracles_are_not():
    hist = make_history()
    cur = round_df(31, [100.1, 99.8, 100.3, 99.9, 100.2, 400.0])
    s = detect_anomalies(cur, hist)
    assert s["O06"] >= 0.9
    assert all(s[f"O0{i}"] < 0.5 for i in range(1, 6))


def test_clean_round_flags_nobody():
    hist = make_history()
    cur = round_df(31, [100.1, 99.8, 100.3, 99.9, 100.2, 100.0])
    s = detect_anomalies(cur, hist)
    assert max(s.values()) < 0.5


def test_cold_start_without_history_still_works():
    cur = round_df(1, [100.0, 100.2, 99.9, 100.1, 350.0])
    s = detect_anomalies(cur, None)
    assert s["O05"] >= 0.9 and s["O01"] < 0.5


def test_scores_in_unit_interval_and_keys_match():
    hist = make_history()
    cur = round_df(31, [100.1, 99.8, 100.3, 99.9, 100.2, 400.0])
    s = detect_anomalies(cur, hist)
    assert set(s) == set(cur["oracle_id"])
    assert all(0.0 <= v <= 1.0 for v in s.values())


def test_scale_invariance():
    hist = make_history()
    cur = round_df(31, [100.1, 99.8, 100.3, 99.9, 100.2, 400.0])
    a = detect_anomalies(cur, hist)
    hist2, cur2 = hist.copy(), cur.copy()
    hist2["value"] *= 1000
    cur2["value"] *= 1000
    b = detect_anomalies(cur2, hist2)
    assert a["O06"] >= 0.9 and b["O06"] >= 0.9
    assert b["O01"] < 0.5


def test_nan_value_is_suspicious():
    cur = round_df(31, [100.1, 99.8, 100.3, np.nan, 100.2])
    s = detect_anomalies(cur, make_history(n_oracles=5))
    assert s["O04"] == 1.0


def test_too_few_oracles_returns_zero():
    cur = round_df(31, [100.0, 500.0])
    assert detect_anomalies(cur, None) == {"O01": 0.0, "O02": 0.0}


def test_stale_oracle_detected_after_repeat():
    hist = make_history(n_rounds=30, n_oracles=6)
    # O06 gèle sa valeur sur les 4 derniers rounds de l'historique
    frozen = hist[(hist.oracle_id == "O06") & (hist.round_id == 26)]["value"].iloc[0]
    mask = (hist.oracle_id == "O06") & (hist.round_id > 26)
    hist.loc[mask, "value"] = frozen
    cur = round_df(31, [100.1, 99.8, 100.3, 99.9, 100.2, frozen])
    s = detect_anomalies(cur, hist)
    assert s["O06"] >= 0.5


def test_deterministic_with_same_seed():
    hist = make_history()
    cur = round_df(31, [100.1, 99.8, 100.3, 99.9, 100.2, 400.0])
    a = AnomalyDetector({"seed": 7}).score_round(cur, hist)
    b = AnomalyDetector({"seed": 7}).score_round(cur, hist)
    assert a == b


def test_missing_columns_raise():
    with pytest.raises(ValueError):
        detect_anomalies(pd.DataFrame({"oracle_id": ["O01"], "value": [1.0]}), None)


def test_ground_truth_column_is_ignored():
    hist = make_history()
    cur = round_df(31, [100.1, 99.8, 100.3, 99.9, 100.2, 400.0])
    a = detect_anomalies(cur, hist)
    cur["ground_truth"] = 100.0
    assert detect_anomalies(cur, hist) == a

def test_modes_stat_and_if_and_invalid():
    hist = make_history()
    cur = round_df(31, [100.1, 99.8, 100.3, 99.9, 100.2, 400.0])
    stat = detect_anomalies(cur, hist, cfg={"mode": "stat"})
    ifo = detect_anomalies(cur, hist, cfg={"mode": "if"})
    assert stat["O06"] >= 0.9
    assert 0.0 <= ifo["O06"] <= 1.0
    with pytest.raises(ValueError):
        AnomalyDetector({"mode": "nimporte"})


def test_if_mode_without_history_returns_zero():
    cur = round_df(1, [100.0, 100.2, 99.9, 100.1, 350.0])
    s = detect_anomalies(cur, None, cfg={"mode": "if"})
    assert all(v == 0.0 for v in s.values())