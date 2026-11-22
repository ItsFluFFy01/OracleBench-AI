import math

import pytest

from oraclebench.confidence import (
    ConfidenceConfig, compute_confidence, confidence_breakdown,
)

GOOD = {"O1": 100.0, "O2": 100.2, "O3": 99.9, "O4": 100.1, "O5": 100.05}
REP1 = {o: 1.0 for o in GOOD}
NOFLAG = {o: False for o in GOOD}


def test_perfect_round_is_near_one():
    assert compute_confidence(GOOD, REP1, NOFLAG) > 0.95


def test_result_always_in_unit_interval():
    wild = {"O1": 1.0, "O2": 1e9, "O3": -5.0}
    c = compute_confidence(wild, {"O1": 0.3, "O2": 0.9, "O3": 1.0}, {})
    assert 0.0 <= c <= 1.0


def test_no_accepted_source_gives_zero():
    assert compute_confidence(GOOD, REP1, {o: True for o in GOOD}) == 0.0
    assert compute_confidence({}, {}, {}) == 0.0


def test_confidence_drops_when_oracles_disagree():
    spread = {"O1": 100.0, "O2": 103.0, "O3": 97.0, "O4": 104.0, "O5": 96.0}
    assert compute_confidence(spread, REP1, NOFLAG) < compute_confidence(GOOD, REP1, NOFLAG) - 0.2


def test_total_disagreement_gives_zero():
    chaos = {"O1": 100.0, "O2": 130.0, "O3": 70.0, "O4": 160.0, "O5": 40.0}
    assert compute_confidence(chaos, REP1, NOFLAG) == 0.0


def test_confidence_drops_with_more_flagged_sources():
    base = compute_confidence(GOOD, REP1, NOFLAG)
    two = compute_confidence(GOOD, REP1, {**NOFLAG, "O1": True, "O2": True})
    assert two < base


def test_confidence_drops_with_low_reputation():
    low = {o: 0.4 for o in GOOD}
    assert compute_confidence(GOOD, low, NOFLAG) < compute_confidence(GOOD, REP1, NOFLAG)


def test_single_source_is_penalised_by_quorum():
    one = {"O1": 100.0}
    c1 = compute_confidence(one, {"O1": 1.0}, {})
    assert c1 < compute_confidence(GOOD, REP1, NOFLAG)
    assert confidence_breakdown(one, {"O1": 1.0}, {})["quorum"] == pytest.approx(1 / 3)


def test_scale_invariance():
    big = {o: v * 1000 for o, v in GOOD.items()}
    assert compute_confidence(big, REP1, NOFLAG) == pytest.approx(compute_confidence(GOOD, REP1, NOFLAG))


def test_nan_values_are_ignored():
    v = {**GOOD, "O6": float("nan")}
    b = confidence_breakdown(v, {**REP1, "O6": 1.0}, NOFLAG)
    assert b["n_answered"] == 5 and not math.isnan(b["confidence"])


def test_missing_reputation_uses_default():
    b = confidence_breakdown({"O1": 100.0, "O2": 100.1, "O3": 99.9}, {}, {})
    assert b["reputation"] == pytest.approx(0.5)


def test_values_must_be_a_mapping():
    with pytest.raises(TypeError):
        compute_confidence([100.0, 100.1], REP1, NOFLAG)


def test_config_validation_and_weights_change_result():
    with pytest.raises(ValueError):
        ConfidenceConfig(min_sources=0)
    with pytest.raises(ValueError):
        ConfidenceConfig(weights={"agreement": 1.0})
    low = {o: 0.4 for o in GOOD}
    heavy_rep = {"weights": {"agreement": 0.0, "reputation": 1.0, "coverage": 0.0, "quorum": 0.0}}
    assert compute_confidence(GOOD, low, NOFLAG, heavy_rep) == pytest.approx(0.4)


def test_fixed_scale_for_quantities_near_zero():
    temps = {"O1": 0.0, "O2": 0.1, "O3": -0.1, "O4": 0.05}
    rep = {o: 1.0 for o in temps}
    relative = compute_confidence(temps, rep, {})                      # médiane ~0 : instable
    fixed = compute_confidence(temps, rep, {}, {"disp_scale": 20.0})   # échelle physique réaliste
    assert fixed > relative