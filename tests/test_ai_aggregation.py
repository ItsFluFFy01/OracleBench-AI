import math

import pandas as pd
import pytest

from oraclebench.ai_aggregation import AggregationConfig, aggregate_round, ai_aggregate


def obs(values):
    return pd.DataFrame({"oracle_id": [f"O{i+1}" for i in range(len(values))], "value": values})


REP = {f"O{i}": 1.0 for i in range(1, 7)}


def test_flagged_oracle_is_excluded():
    df = obs([100.0, 100.2, 99.8, 100.1, 99.9, 900.0])
    scores = {"O6": 1.0}
    value, conf = ai_aggregate(df, REP, scores)
    assert value == pytest.approx(100.0, abs=0.1)
    assert conf > 0.8


def test_without_flag_the_outlier_pulls_the_value():
    df = obs([100.0, 100.2, 99.8, 100.1, 99.9, 900.0])
    value, _ = ai_aggregate(df, REP, {})
    assert value > 200


def test_reputation_weights_the_average():
    df = obs([100.0, 110.0, 100.0])
    rep = {"O1": 1.0, "O2": 0.1, "O3": 1.0}
    v_weighted, _ = ai_aggregate(df, rep, {})
    v_plain, _ = ai_aggregate(df, {"O1": 1.0, "O2": 1.0, "O3": 1.0}, {})
    assert v_weighted < v_plain
    assert v_weighted == pytest.approx((100 + 11 + 100) / 2.1)


def test_all_flagged_falls_back_to_median_with_zero_confidence():
    df = obs([100.0, 101.0, 102.0])
    value, conf = ai_aggregate(df, REP, {"O1": 1.0, "O2": 1.0, "O3": 1.0})
    assert value == pytest.approx(101.0) and conf == 0.0


def test_all_accepted_with_zero_reputation_does_not_crash():
    df = obs([100.0, 102.0])
    value, conf = ai_aggregate(df, {"O1": 0.0, "O2": 0.0}, {})
    assert value == pytest.approx(101.0) and conf == 0.0


def test_nan_value_is_dropped_and_flagged():
    df = obs([100.0, 100.1, float("nan"), 99.9])
    r = aggregate_round(df, REP, {})
    status = {p["oracle_id"]: p["status"] for p in r["per_oracle"]}
    assert status["O3"] == "ALERT" and not math.isnan(r["final_value"])


def test_no_usable_value_returns_nan_and_zero():
    value, conf = ai_aggregate(obs([float("nan"), float("nan")]), REP, {})
    assert math.isnan(value) and conf == 0.0


def test_threshold_controls_exclusion():
    df = obs([100.0, 100.1, 99.9, 130.0])
    scores = {"O4": 0.4}
    kept, _ = ai_aggregate(df, REP, scores, {"anomaly_threshold": 0.5})
    dropped, _ = ai_aggregate(df, REP, scores, {"anomaly_threshold": 0.3})
    assert kept > dropped


def test_soft_weighting_reduces_influence_of_borderline_oracle():
    df = obs([100.0, 100.1, 99.9, 108.0])
    scores = {"O4": 0.45}
    hard, _ = ai_aggregate(df, REP, scores)
    soft, _ = ai_aggregate(df, REP, scores, {"soft_weighting": True})
    assert soft < hard


def test_result_matches_round_result_schema():
    r = aggregate_round(obs([100.0, 100.1, 99.9, 150.0]), REP, {"O4": 0.9})
    assert set(r) >= {"final_value", "confidence", "per_oracle"}
    assert {"oracle_id", "value", "anomaly_score", "reputation", "status"} <= set(r["per_oracle"][0])
    assert {p["status"] for p in r["per_oracle"]} <= {"NORMAL", "ALERT"}


def test_unknown_oracle_gets_default_reputation_and_config_validation():
    r = aggregate_round(obs([100.0, 100.1, 99.9]), {}, {})
    assert all(p["reputation"] == 0.5 for p in r["per_oracle"])
    with pytest.raises(ValueError):
        AggregationConfig(anomaly_threshold=0.0)
    with pytest.raises(ValueError):
        aggregate_round(pd.DataFrame({"x": [1]}), REP, {})