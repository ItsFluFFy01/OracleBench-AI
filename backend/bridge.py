"""
Client du pont blockchain (Personne C fournit le serveur ethers.js ; B l'appelle).

Contrat proposé (à valider avec C, à écrire dans contracts/bridge.md) :
    POST {BRIDGE_URL}/record
        corps    : {"round_id": int, "final_value": float, "confidence": float, "proof_hash": "0x..."}
        réponse  : {"status": "VERIFIED" | "REJECTED", "tx_hash": "0x...", "gas_used": int}
    En cas d'erreur le pont répond avec un code HTTP >= 400.

MockBridge : sert tant que le vrai pont n'existe pas (aucun réseau, déterministe).
"""
from __future__ import annotations

import hashlib
import os

import requests


class BridgeError(Exception):
    """Le pont est injoignable ou a répondu de façon invalide."""


class MockBridge:
    mode = "mock"

    def record(self, round_id: int, final_value: float, confidence: float, proof_hash: str) -> dict:
        digest = hashlib.sha256(f"mock|{round_id}|{proof_hash}".encode()).hexdigest()
        return {"status": "VERIFIED", "tx_hash": "0x" + digest, "gas_used": 52000}


class HttpBridge:
    mode = "http"

    def __init__(self, base_url: str, timeout: float = 5.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def record(self, round_id: int, final_value: float, confidence: float, proof_hash: str) -> dict:
        body = {"round_id": int(round_id), "final_value": float(final_value),
                "confidence": float(confidence), "proof_hash": proof_hash}
        try:
            r = requests.post(f"{self.base_url}/record", json=body, timeout=self.timeout)
        except requests.RequestException as e:
            raise BridgeError(f"pont injoignable : {type(e).__name__}") from e
        if r.status_code == 422:
            try:
                data = r.json()
                return {"status": data.get("status", "REJECTED"), "tx_hash": None, "gas_used": None,
                        "reason": data.get("reason", "confidence_below_threshold")}
            except Exception:
                return {"status": "REJECTED", "tx_hash": None, "gas_used": None}
        if r.status_code >= 400:
            raise BridgeError(f"le pont a répondu HTTP {r.status_code}")
        try:
            data = r.json()
            status = str(data["status"])
        except (ValueError, KeyError, TypeError) as e:
            raise BridgeError("réponse du pont invalide (JSON avec 'status' attendu)") from e
        gas = data.get("gas_used")
        return {"status": status, "tx_hash": data.get("tx_hash"),
                "gas_used": int(gas) if isinstance(gas, (int, float)) and not isinstance(gas, bool) else None}


def create_bridge(url: str | None = None):
    url = url or os.getenv("BRIDGE_URL")
    return HttpBridge(url, float(os.getenv("BRIDGE_TIMEOUT", "5"))) if url else MockBridge()