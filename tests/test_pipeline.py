import numpy as np
import pytest

from backend.storage import ParquetRoundStore
from oraclebench.pipeline import RoundOrderError, RoundProcessor, baselines


def obs(values, prefix="O"):
    return [{"oracle_id": f"{prefix}{i+1}", "value": v} for i, v in enumerate(values)]


GOOD = [100.0, 100.2, 99.8, 100.1, 99.9, 100.05]


def test_outlier_is_filtered_and_reputation_drops():
    p = RoundProcessor()
    r = p.process(1, obs(GOOD[:5] + [900.0]))
    assert r["final_value"] == pytest.approx(100.0, abs=0.2)
    assert {x["oracle_id"]: x["status"] for x in r["per_oracle"]}["O6"] == "ALERT"
    assert p.reputation.get()["O6"] < p.reputation.get()["O1"]


def test_rounds_must_be_strictly_increasing():
    p = RoundProcessor()
    p.process(5, obs(GOOD))
    for bad in (5, 4):
        with pytest.raises(RoundOrderError):
            p.process(bad, obs(GOOD))
    p.process(6, obs(GOOD))


def test_prepare_does_not_change_state_until_commit():
    p = RoundProcessor()
    prep = p.prepare(1, obs(GOOD[:5] + [900.0]))
    assert p.last_round_id is None and p.reputation.get() == {}
    p.commit(prep)
    assert p.last_round_id == 1 and p.reputation.get()["O6"] < 1.0


def test_duplicate_oracle_ids_rejected():
    with pytest.raises(ValueError):
        RoundProcessor().process(1, [{"oracle_id": "A", "value": 1.0}, {"oracle_id": "A", "value": 2.0}])


def test_methods_contain_all_baselines_and_ai():
    r = RoundProcessor().process(1, obs(GOOD[:5] + [900.0]))
    assert set(r["methods"]) == {"mean", "median", "trimmed", "weighted", "ai"}
    assert r["methods"]["mean"] > 200 and r["methods"]["ai"] == r["final_value"]


def test_baselines_edge_cases():
    assert baselines([])["mean"] is None
    assert baselines([5.0, 7.0])["trimmed"] == 6.0          # moins de 3 valeurs : pas d'écrêtage
    assert baselines([1.0, 2.0, 100.0], [1, 1, 0])["weighted"] == pytest.approx(1.5)
    assert baselines([1.0, 2.0], [0, 0])["weighted"] is None


def test_history_is_capped():
    p = RoundProcessor({"history_rounds": 5})
    for r in range(1, 20):
        p.process(r, obs(GOOD))
    assert p._history["round_id"].nunique() == 5


def test_detects_after_warmup_with_history():
    rng = np.random.default_rng(0)
    p = RoundProcessor()
    for r in range(1, 30):
        p.process(r, obs([100 + rng.normal(0, 0.3) for _ in range(6)]))
    res = p.process(30, obs([100.1, 99.9, 100.2, 100.0, 99.8, 160.0]))
    assert {x["oracle_id"]: x["status"] for x in res["per_oracle"]}["O6"] == "ALERT"


def test_restore_from_store_reproduces_reputation(tmp_path):
    store = ParquetRoundStore(tmp_path, "r")
    live = RoundProcessor()
    for r in range(1, 12):
        values = GOOD[:5] + [900.0 if r % 2 else 100.0]
        prep = live.prepare(r, obs(values))
        store.save_round(r, prep.result, methods=prep.result["methods"])
        live.commit(prep)
    restored = RoundProcessor()
    assert restored.restore_from_store(store) == 11
    assert restored.last_round_id == 11
    assert restored.reputation.get() == pytest.approx(live.reputation.get())
    with pytest.raises(RoundOrderError):
        restored.process(11, obs(GOOD))