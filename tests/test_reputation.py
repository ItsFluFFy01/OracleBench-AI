import numpy as np
import pytest

from oraclebench.reputation import (
    ReputationConfig, ReputationEngine, degradation_recovery_time, update_reputation,
)


def test_bounds_always_respected():
    eng = ReputationEngine(oracle_ids=["A"])
    for _ in range(50):
        assert 0.0 <= eng.update({"A": True})["A"] <= 1.0
    for _ in range(200):
        assert 0.0 <= eng.update({"A": False})["A"] <= 1.0
    assert eng.get()["A"] == 1.0


def test_penalty_grows_with_repeated_anomalies():
    eng = ReputationEngine(oracle_ids=["A"])
    r1 = eng.update({"A": True})["A"]            # 1.00 - 0.10
    r2 = eng.update({"A": True})["A"]            # - 0.20
    r3 = eng.update({"A": True})["A"]            # - 0.30
    assert (1.0 - r1) == pytest.approx(0.10)
    assert (r1 - r2) == pytest.approx(0.20)
    assert (r2 - r3) == pytest.approx(0.30)


def test_single_error_is_not_irreversible():
    eng = ReputationEngine(oracle_ids=["A"])
    eng.update({"A": True})
    for _ in range(10):
        eng.update({"A": False})
    assert eng.get()["A"] == pytest.approx(1.0)


def test_recovery_accelerates_after_stability():
    eng = ReputationEngine(oracle_ids=["A"])
    for _ in range(3):
        eng.update({"A": True})                  # tombe à 0.4
    r = eng.get()["A"]
    gains = []
    for _ in range(12):
        new = eng.update({"A": False})["A"]
        gains.append(new - r)
        r = new
    assert gains[0] == pytest.approx(0.02)
    assert gains[-1] == pytest.approx(0.04)      # bonus après 10 rounds stables


def test_newcomer_starts_lower_than_veterans():
    eng = ReputationEngine(oracle_ids=["A", "B"])
    eng.update({"A": False, "B": False, "NEW": False})
    rep = eng.get()
    assert rep["NEW"] < rep["A"]
    assert rep["NEW"] == pytest.approx(0.5 + 0.02)


def test_absent_oracle_keeps_its_reputation():
    eng = ReputationEngine(oracle_ids=["A", "B"])
    eng.update({"A": True, "B": True})
    before = eng.get()["B"]
    eng.update({"A": False})                      # B n'a pas répondu
    assert eng.get()["B"] == before


def test_function_is_pure_and_does_not_mutate_input():
    rep = {"A": 0.8}
    out = update_reputation(rep, {"A": True}, {})
    assert rep == {"A": 0.8} and out["A"] < 0.8


def test_float_scores_are_rejected():
    with pytest.raises(TypeError):
        update_reputation({"A": 1.0}, {"A": 0.02}, {})
    assert update_reputation({"A": 1.0}, {"A": np.bool_(False)}, {})["A"] == 1.0


def test_config_validation_and_from_dict():
    with pytest.raises(ValueError):
        ReputationConfig(min_rep=0.9, max_rep=0.1)
    assert ReputationConfig.from_dict({"penalty": 0.2, "inconnu": 1}).penalty == 0.2


def test_degradation_and_recovery_time():
    t = degradation_recovery_time()
    assert t["rounds_to_degrade"] == 3
    assert t["rounds_to_recover"] is not None and t["rounds_to_recover"] > t["rounds_to_degrade"]
    slow = degradation_recovery_time({"reward": 0.01})
    assert slow["rounds_to_recover"] > t["rounds_to_recover"]


def test_bad_oracle_ends_far_below_good_one():
    rng = np.random.default_rng(0)
    eng = ReputationEngine(oracle_ids=["GOOD", "BAD"])
    for _ in range(100):
        eng.update({"GOOD": bool(rng.random() < 0.05), "BAD": bool(rng.random() < 0.8)})
    rep = eng.get()
    assert rep["GOOD"] > 0.7 and rep["BAD"] < 0.3