import pytest

from backend.api import create_app
from backend.bridge import BridgeError, MockBridge
from backend.storage import ParquetRoundStore

GOOD = [100.0, 100.2, 99.8, 100.1, 99.9]


def payload(round_id, values, **extra):
    return {"round_id": round_id,
            "observations": [{"oracle_id": f"O{i+1}", "value": v} for i, v in enumerate(values)], **extra}


class FlakyBridge:
    mode = "flaky"

    def __init__(self):
        self.up, self.calls = False, 0

    def record(self, *a):
        self.calls += 1
        if not self.up:
            raise BridgeError("pont injoignable : test")
        return MockBridge().record(*a)


@pytest.fixture
def store(tmp_path):
    return ParquetRoundStore(tmp_path, "api")


@pytest.fixture
def client(store):
    return create_app(store=store, bridge=MockBridge()).test_client()


def test_health(client):
    r = client.get("/health").get_json()
    assert r["status"] == "ok" and r["bridge"] == "mock" and r["latest_round_id"] is None


def test_post_round_happy_path(client, store):
    resp = client.post("/round", json=payload(1, GOOD + [900.0], ground_truth=100.0))
    assert resp.status_code == 201
    r = resp.get_json()
    assert r["final_value"] == pytest.approx(100.0, abs=0.2) and r["ground_truth"] == 100.0
    assert {p["oracle_id"]: p["status"] for p in r["per_oracle"]}["O6"] == "ALERT"
    assert r["blockchain"]["status"] == "VERIFIED" and r["blockchain"]["tx_hash"].startswith("0x")
    assert r["proof_hash"].startswith("0x") and set(r["methods"]) >= {"mean", "median", "ai"}
    assert store.count() == 1


def test_ground_truth_never_changes_the_result(tmp_path):
    a = create_app(store=ParquetRoundStore(tmp_path, "a"), bridge=MockBridge()).test_client()
    b = create_app(store=ParquetRoundStore(tmp_path, "b"), bridge=MockBridge()).test_client()
    ra = a.post("/round", json=payload(1, GOOD + [900.0])).get_json()
    rb = b.post("/round", json=payload(1, GOOD + [900.0], ground_truth=12345.0)).get_json()
    assert ra["final_value"] == rb["final_value"] and ra["confidence"] == rb["confidence"]
    assert ra["proof_hash"] == rb["proof_hash"]


def test_round_order_conflict(client):
    assert client.post("/round", json=payload(5, GOOD)).status_code == 201
    assert client.post("/round", json=payload(5, GOOD)).status_code == 409
    assert client.post("/round", json=payload(4, GOOD)).status_code == 409
    assert client.post("/round", json=payload(6, GOOD)).status_code == 201


@pytest.mark.parametrize("body", [
    {}, {"round_id": 1}, {"round_id": 1, "observations": []}, {"round_id": -1, "observations": [{"oracle_id": "A", "value": 1}]},
    {"round_id": True, "observations": [{"oracle_id": "A", "value": 1}]},
    {"round_id": "1", "observations": [{"oracle_id": "A", "value": 1}]},
    {"round_id": 1, "observations": [{"oracle_id": "A", "value": "100"}]},
    {"round_id": 1, "observations": [{"oracle_id": "A", "value": True}]},
    {"round_id": 1, "observations": [{"oracle_id": "A", "value": None}]},
    {"round_id": 1, "observations": [{"oracle_id": "A"}]},
    {"round_id": 1, "observations": [{"oracle_id": "bad id!", "value": 1}]},
    {"round_id": 1, "observations": [{"oracle_id": "A", "value": 1}, {"oracle_id": "A", "value": 2}]},
    {"round_id": 1, "observations": ["x"]},
    {"round_id": 1, "observations": [{"oracle_id": "A", "value": 1}], "ground_truth": "abc"},
])
def test_validation_errors_return_400(client, body):
    r = client.post("/round", json=body)
    assert r.status_code == 400 and "error" in r.get_json()


def test_nan_and_infinity_literals_are_rejected(client):
    for lit in ("NaN", "Infinity"):
        raw = '{"round_id":1,"observations":[{"oracle_id":"A","value":%s}]}' % lit
        assert client.post("/round", data=raw, content_type="application/json").status_code == 400


def test_non_json_and_malformed_bodies(client):
    assert client.post("/round", data="x=1", content_type="text/plain").status_code == 415
    assert client.post("/round", data="{broken", content_type="application/json").status_code == 400


def test_failed_validation_leaves_state_untouched(client, store):
    client.post("/round", json={"round_id": 1, "observations": []})
    assert store.count() == 0
    assert client.post("/round", json=payload(1, GOOD)).status_code == 201


def test_get_round_and_404(client):
    posted = client.post("/round", json=payload(1, GOOD)).get_json()
    got = client.get("/round/1").get_json()
    assert got["proof_hash"] == posted["proof_hash"] and got["blockchain"]["status"] == "VERIFIED"
    assert client.get("/round/99").status_code == 404


def test_round_plural_alias(client):
    posted = client.post("/round", json=payload(1, GOOD)).get_json()
    got = client.get("/rounds/1").get_json()
    assert got["proof_hash"] == posted["proof_hash"]


def test_list_rounds_order_limit_and_bad_params(client):
    for r in (1, 2, 3):
        client.post("/round", json=payload(r, GOOD))
    desc = client.get("/rounds?limit=2").get_json()
    assert desc["total"] == 3 and [x["round_id"] for x in desc["rounds"]] == [3, 2]
    asc = client.get("/rounds?order=asc").get_json()
    assert [x["round_id"] for x in asc["rounds"]] == [1, 2, 3]
    assert asc["rounds"][0]["chain_status"] == "VERIFIED"
    for q in ("limit=abc", "limit=0", "limit=5000", "order=sideways"):
        assert client.get(f"/rounds?{q}").status_code == 400


def test_list_rounds_format_array(client):
    for r in (1, 2):
        client.post("/round", json=payload(r, GOOD))
    res = client.get("/rounds?format=array").get_json()
    assert isinstance(res, list) and len(res) == 2
    res_full = client.get("/rounds?format=array&full=true").get_json()
    assert isinstance(res_full, list) and len(res_full) == 2
    assert "methods" in res_full[0] and "per_oracle" in res_full[0]


def test_list_rounds_empty(client):
    assert client.get("/rounds").get_json() == {"run_id": "api", "total": 0, "rounds": []}


def test_experiments_summary_endpoint(client):
    res = client.get("/experiments/summary")
    assert res.status_code == 200
    data = res.get_json()
    assert "methods" in data and "detection" in data


def test_reputation_endpoint(client):
    client.post("/round", json=payload(1, GOOD + [900.0]))
    rep = client.get("/reputation").get_json()
    assert rep["last_round_id"] == 1 and rep["reputation"]["O6"] < rep["reputation"]["O1"]


def test_low_confidence_is_not_sent_to_the_chain(store):
    bridge = FlakyBridge()
    bridge.up = True
    c = create_app(store=store, bridge=bridge, config={"chain_min_confidence": 0.999}).test_client()
    r = c.post("/round", json=payload(1, GOOD)).get_json()
    assert r["blockchain"]["status"] == "SKIPPED" and bridge.calls == 0


def test_bridge_outage_keeps_the_round_and_retry_works(store):
    bridge = FlakyBridge()
    c = create_app(store=store, bridge=bridge).test_client()
    resp = c.post("/round", json=payload(1, GOOD))
    assert resp.status_code == 201 and resp.get_json()["blockchain"]["status"] == "ERROR"
    assert "error" in resp.get_json()["blockchain"] and store.count() == 1
    bridge.up = True
    retried = c.post("/round/1/record").get_json()
    assert retried["blockchain"]["status"] == "VERIFIED" and retried["blockchain"]["tx_hash"]
    assert c.post("/round/1/record").status_code == 409
    assert c.post("/round/99/record").status_code == 404


def test_restart_restores_state_from_the_store(store):
    first = create_app(store=store, bridge=MockBridge()).test_client()
    for r in (1, 2, 3):
        first.post("/round", json=payload(r, GOOD + [900.0]))
    rep_before = first.get("/reputation").get_json()["reputation"]
    second = create_app(store=store, bridge=MockBridge()).test_client()      # « redémarrage »
    assert second.get("/reputation").get_json()["reputation"] == pytest.approx(rep_before)
    assert second.post("/round", json=payload(3, GOOD)).status_code == 409
    assert second.post("/round", json=payload(4, GOOD)).status_code == 201


def test_payload_too_large_returns_413(store):
    c = create_app(store=store, bridge=MockBridge(), config={"max_content_length": 200}).test_client()
    assert c.post("/round", json=payload(1, [100.0] * 50)).status_code == 413


def test_unknown_route_and_wrong_method_are_json(client):
    assert client.get("/nope").get_json()["error"]
    assert client.get("/round").status_code in (404, 405)
    assert client.delete("/rounds").status_code == 405


def test_cors_header_for_allowed_origin(client):
    r = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert r.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"
    r2 = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "Access-Control-Allow-Origin" not in r2.headers


def test_unexpected_bridge_crash_still_returns_201_with_error_status(store):
    class Boom(MockBridge):
        def record(self, *a):
            raise RuntimeError("secret internal detail")
    c = create_app(store=store, bridge=Boom()).test_client()
    r = c.post("/round", json=payload(1, GOOD))
    assert r.status_code == 201 and r.get_json()["blockchain"]["status"] == "ERROR"
    assert "secret" not in r.get_data(as_text=True) and store.count() == 1


def test_storage_failure_returns_500_without_leaking_and_leaves_state_untouched(store):
    class DownStore(ParquetRoundStore):
        broken = True

        def save_round(self, *a, **k):
            if self.broken:
                raise RuntimeError("secret database password")
            return super().save_round(*a, **k)

    s = DownStore(store.base.parent, "down")
    c = create_app(store=s, bridge=MockBridge()).test_client()
    r = c.post("/round", json=payload(1, GOOD))
    assert r.status_code == 500 and "secret" not in r.get_data(as_text=True)
    assert c.get("/reputation").get_json()["last_round_id"] is None       # l'état n'a pas avancé
    s.broken = False
    assert c.post("/round", json=payload(1, GOOD)).status_code == 201      # le même round peut être renvoyé
