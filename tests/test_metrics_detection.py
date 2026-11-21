import math

import numpy as np
import pandas as pd
import pytest

from oraclebench.metrics_detection import (
    best_threshold, detection_metrics, evaluate_scores, latency_summary,
    replay_detector, threshold_sweep, timer,
)


def test_confusion_and_metrics_known_case():
    y_true = [1, 1, 1, 0, 0, 0, 0, 0]
    y_pred = [1, 1, 0, 1, 0, 0, 0, 0]
    m = detection_metrics(y_true, y_pred)
    assert (m["tp"], m["fn"], m["fp"], m["tn"]) == (2, 1, 1, 4)
    assert m["precision"] == pytest.approx(2 / 3)
    assert m["recall"] == pytest.approx(2 / 3)
    assert m["f1"] == pytest.approx(2 / 3)
    assert m["fpr"] == pytest.approx(1 / 5)


def test_undefined_metrics_are_nan_not_crash():
    m = detection_metrics([0, 0, 0], [0, 0, 0])   # aucun positif réel ni prédit
    assert math.isnan(m["precision"]) and math.isnan(m["recall"]) and math.isnan(m["f1"])
    assert m["fpr"] == 0.0


def test_size_mismatch_raises():
    with pytest.raises(ValueError):
        detection_metrics([1, 0], [1])


def test_perfect_and_inverted_scores_auc():
    y = [0, 0, 1, 1]
    assert evaluate_scores(y, [0.1, 0.2, 0.8, 0.9])["auc"] == pytest.approx(1.0)
    assert evaluate_scores(y, [0.9, 0.8, 0.2, 0.1])["auc"] == pytest.approx(0.0)
    assert math.isnan(evaluate_scores([0, 0], [0.1, 0.2])["auc"])


def test_threshold_sweep_and_best_threshold():
    y = [0, 0, 0, 1, 1, 1]
    s = [0.1, 0.2, 0.45, 0.55, 0.8, 0.9]
    sw = threshold_sweep(y, s, [0.3, 0.5, 0.7])
    assert list(sw["threshold"]) == [0.3, 0.5, 0.7]
    assert best_threshold(sw) == 0.5
    assert best_threshold(sw, max_fpr=0.0) == 0.5
    with pytest.raises(ValueError):
        best_threshold(sw.assign(fpr=1.0), max_fpr=0.0)


def test_timer_and_latency_summary():
    store = []
    with timer(store):
        sum(range(1000))
    assert len(store) == 1 and store[0] >= 0
    s = latency_summary([1.0, 2.0, 3.0, 4.0, 100.0])
    assert s["n"] == 5 and s["p50_ms"] == 3.0 and s["p95_ms"] > s["p50_ms"]
    assert math.isnan(latency_summary([])["mean_ms"])


def test_replay_detector_no_future_leak_and_warmup():
    rng = np.random.default_rng(0)
    rows = []
    for r in range(1, 41):
        for i in range(1, 7):
            v = 100 + rng.normal(0, 0.5) + (300 if (i == 6 and r > 20) else 0)
            rows.append((r, f"O{i:02d}", v, int(i == 6 and r > 20)))
    df = pd.DataFrame(rows, columns=["round_id", "oracle_id", "value", "is_bad"])
    out, lat = replay_detector(df, warmup=15)
    assert out["round_id"].min() == 16 and len(lat) == 40
    m = evaluate_scores(out["is_bad"], out["score"], 0.5)
    assert m["recall"] > 0.9 and m["fpr"] < 0.05