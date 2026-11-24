"""Mêmes tests sur chaque backend : Parquet, SQLite (via SQL) et PostgreSQL.
PostgreSQL n'est testé que si TEST_DATABASE_URL est défini (sinon ces cas sont ignorés)."""
import os
import uuid

import pytest

from backend.storage import ParquetRoundStore
from backend.storage_base import compute_proof_hash
from backend.storage_sql import SqlRoundStore


def make_result(final=100.2, conf=0.9):
    per = [
        {"oracle_id": "O1", "value": 100.1, "anomaly_score": 0.02, "reputation": 1.0, "status": "NORMAL"},
        {"oracle_id": "O2", "value": 100.3, "anomaly_score": 0.05, "reputation": 0.9, "status": "NORMAL"},
        {"oracle_id": "O3", "value": 150.0, "anomaly_score": 0.97, "reputation": 0.3, "status": "ALERT"},
    ]
    return {"final_value": final, "confidence": conf, "per_oracle": per, "n_accepted": 2,
            "breakdown": {"agreement": 0.95, "coverage": 0.66}}


@pytest.fixture(params=["parquet", "sqlite", "postgres"])
def make_store(request, tmp_path):
    suffix = uuid.uuid4().hex[:8]          # isole chaque test dans PostgreSQL
    created = []

    def _make(run_id="run1"):
        if request.param == "parquet":
            s = ParquetRoundStore(tmp_path, run_id)
        elif request.param == "sqlite":
            s = SqlRoundStore(f"sqlite:///{(tmp_path / 't.db').as_posix()}", run_id)
        else:
            url = os.getenv("TEST_DATABASE_URL")
            if not url:
                pytest.skip("TEST_DATABASE_URL non défini : test PostgreSQL ignoré")
            s = SqlRoundStore(url, f"{run_id}-{suffix}")
        created.append(s)
        return s

    yield _make
    for s in created:
        s.delete_run()


@pytest.fixture
def store(make_store):
    return make_store()


def test_save_and_get_roundtrip(store):
    saved = store.save_round(7, make_result(), ground_truth=100.0, methods={"mean": 116.8, "median": 100.3})
    got = store.get_round(7)
    assert got["round_id"] == 7 and got["final_value"] == pytest.approx(100.2)
    assert got["confidence"] == pytest.approx(0.9) and got["ground_truth"] == 100.0
    assert got["methods"] == {"mean": 116.8, "median": 100.3}
    assert got["breakdown"] == {"agreement": 0.95, "coverage": 0.66}
    assert got["proof_hash"] == saved["proof_hash"]
    assert [p["oracle_id"] for p in got["per_oracle"]] == ["O1", "O2", "O3"]
    assert got["per_oracle"][2]["status"] == "ALERT"


def test_missing_round_returns_none(store):
    assert store.get_round(99) is None
    assert store.latest_round_id() is None and store.count() == 0
    assert store.load_observations(99).empty


def test_save_is_an_upsert(store):
    store.save_round(1, make_result(final=100.0))
    store.save_round(1, make_result(final=555.0))
    assert store.count() == 1 and store.get_round(1)["final_value"] == 555.0
    assert len(store.load_observations(1)) == 3          # pas de doublons d'observations


def test_list_rounds_order_limit_and_empty(store):
    assert store.list_rounds().empty
    for r in (3, 1, 2):
        store.save_round(r, make_result())
    assert list(store.list_rounds()["round_id"]) == [1, 2, 3]
    assert list(store.list_rounds(limit=2, descending=True)["round_id"]) == [3, 2]
    assert store.latest_round_id() == 3
    assert {"final_value", "confidence", "proof_hash", "methods_json"} <= set(store.list_rounds().columns)


def test_nan_final_value_is_json_safe(store):
    store.save_round(1, make_result(final=float("nan"), conf=0.0))
    got = store.get_round(1)
    assert got["final_value"] is None and got["confidence"] == 0.0


def test_update_blockchain(store):
    store.save_round(4, make_result())
    assert store.update_blockchain(4, "0xabc", 51234, "VERIFIED") is True
    assert store.get_round(4)["blockchain"] == {"tx_hash": "0xabc", "gas_used": 51234, "status": "VERIFIED"}
    assert store.get_round(4)["per_oracle"][0]["oracle_id"] == "O1"
    assert store.update_blockchain(999, "0x", 1, "X") is False


def test_blockchain_fields_empty_before_update(store):
    store.save_round(1, make_result())
    assert store.get_round(1)["blockchain"] == {"tx_hash": None, "gas_used": None, "status": None}


def test_upsert_resets_blockchain_fields(store):
    store.save_round(1, make_result())
    store.update_blockchain(1, "0xabc", 1, "VERIFIED")
    store.save_round(1, make_result(final=1.0))
    assert store.get_round(1)["blockchain"]["tx_hash"] is None


def test_runs_are_isolated(make_store):
    a, b = make_store("A"), make_store("B")
    a.save_round(1, make_result())
    assert b.get_round(1) is None and b.count() == 0 and a.count() == 1


def test_delete_run_only_deletes_its_own_data(make_store):
    a, b = make_store("A"), make_store("B")
    a.save_round(1, make_result())
    b.save_round(1, make_result())
    a.delete_run()
    assert a.count() == 0 and a.load_observations().empty and b.count() == 1


@pytest.mark.parametrize("bad", ["../evil", "a/b", "", "x" * 65, "run 1", "a'; DROP TABLE x;--"])
def test_invalid_run_id_is_rejected(tmp_path, bad):
    with pytest.raises(ValueError):
        ParquetRoundStore(tmp_path, bad)
    with pytest.raises(ValueError):
        SqlRoundStore(f"sqlite:///{(tmp_path / 'x.db').as_posix()}", bad)


def test_load_observations_all_and_one(store):
    for r in (1, 2):
        store.save_round(r, make_result())
    allobs = store.load_observations()
    assert len(allobs) == 6 and list(allobs["round_id"].unique()) == [1, 2]
    assert len(store.load_observations(2)) == 3
    assert list(allobs.columns) == ["run_id", "round_id", "oracle_id", "value",
                                    "anomaly_score", "reputation", "status"]


def test_store_reopens_with_existing_data(make_store):
    make_store("r").save_round(1, make_result())
    again = make_store("r")
    assert again.count() == 1 and again.get_round(1)["round_id"] == 1


def test_ground_truth_is_a_plain_python_float_or_none(store):
    store.save_round(1, make_result(), ground_truth=100.0)
    store.save_round(2, make_result())
    assert type(store.get_round(1)["ground_truth"]) is float
    assert store.get_round(2)["ground_truth"] is None


def test_weird_oracle_id_is_stored_literally_not_executed(store):
    r = make_result()
    r["per_oracle"][0]["oracle_id"] = "O1'; DROP TABLE oraclebench_rounds;--"
    store.save_round(1, r)
    assert store.count() == 1
    assert any("DROP TABLE" in p["oracle_id"] for p in store.get_round(1)["per_oracle"])


def test_proof_hash_is_deterministic_order_independent_and_sensitive():
    per = make_result()["per_oracle"]
    h = compute_proof_hash(5, per)
    assert h == compute_proof_hash(5, list(reversed(per)))
    assert h.startswith("0x") and len(h) == 66                    # bytes32
    assert h != compute_proof_hash(6, per)
    changed = [dict(p) for p in per]
    changed[0]["value"] = 100.11
    assert h != compute_proof_hash(5, changed)
    assert h == compute_proof_hash(5, [{**p, "anomaly_score": 0.5} for p in per])


def test_same_proof_hash_on_every_backend(tmp_path):
    p = ParquetRoundStore(tmp_path, "x").save_round(1, make_result())["proof_hash"]
    s = SqlRoundStore(f"sqlite:///{(tmp_path / 'y.db').as_posix()}", "x").save_round(1, make_result())["proof_hash"]
    assert p == s