import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from backend.bridge import BridgeError, HttpBridge, MockBridge, create_bridge

ARGS = (3, 100.2, 0.9, "0x" + "ab" * 32)


class _Handler(BaseHTTPRequestHandler):
    mode = "ok"
    received = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        type(self).received.append((self.path, body))
        if type(self).mode == "500":
            self.send_response(500); self.end_headers(); return
        if type(self).mode == "422":
            self.send_response(422)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"REJECTED","reason":"confidence_below_threshold"}')
            return
        payload = {"ok": b'{"status":"VERIFIED","tx_hash":"0xabc","gas_used":51000}',
                   "bad_json": b"not json", "no_status": b'{"tx_hash":"0x1"}'}[type(self).mode]
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *a):
        pass


@pytest.fixture
def server():
    srv = HTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    _Handler.received = []
    _Handler.mode = "ok"
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def test_mock_bridge_is_deterministic_and_verified():
    a, b = MockBridge().record(*ARGS), MockBridge().record(*ARGS)
    assert a == b and a["status"] == "VERIFIED" and a["tx_hash"].startswith("0x") and len(a["tx_hash"]) == 66


def test_http_bridge_success_and_request_format(server):
    res = HttpBridge(server).record(*ARGS)
    assert res == {"status": "VERIFIED", "tx_hash": "0xabc", "gas_used": 51000}
    path, body = _Handler.received[0]
    assert path == "/record"
    assert body == {"round_id": 3, "final_value": 100.2, "confidence": 0.9, "proof_hash": ARGS[3]}


def test_http_bridge_handles_422_rejection(server):
    _Handler.mode = "422"
    res = HttpBridge(server).record(*ARGS)
    assert res["status"] == "REJECTED"
    assert res["tx_hash"] is None


@pytest.mark.parametrize("mode", ["500", "bad_json", "no_status"])
def test_http_bridge_errors_raise_bridge_error(server, mode):
    _Handler.mode = mode
    with pytest.raises(BridgeError):
        HttpBridge(server).record(*ARGS)


def test_http_bridge_unreachable_raises_bridge_error():
    with pytest.raises(BridgeError):
        HttpBridge("http://127.0.0.1:1", timeout=1).record(*ARGS)


def test_create_bridge_from_environment(monkeypatch):
    monkeypatch.delenv("BRIDGE_URL", raising=False)
    assert create_bridge().mode == "mock"
    monkeypatch.setenv("BRIDGE_URL", "http://localhost:3001/")
    b = create_bridge()
    assert b.mode == "http" and b.base_url == "http://localhost:3001"
