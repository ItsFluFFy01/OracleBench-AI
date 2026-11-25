"""
API Flask d'OracleBench-AI (Personne B).

    GET  /health                 état du service
    POST /round                  traite un round (détection, réputation, agrégation, stockage, pont)
    GET  /round/<id>             résultat complet d'un round (alias: /rounds/<id>)
    GET  /rounds?limit=&order=   liste résumée (order = asc | desc, défaut desc)
                                 (?format=array pour tableau direct OpenAPI/dashboard)
    GET  /reputation             réputations actuelles
    GET  /experiments/summary    synthèse globale des métriques (pour le dashboard)
    POST /round/<id>/record      renvoie un round au pont (après une panne du pont)

Corps de POST /round :
    {"round_id": 12,
     "observations": [{"oracle_id": "O01", "value": 100.2, "timestamp": "...", "profile": "normal"}, ...],
     "ground_truth": 100.0}          <- optionnel, mode expérimental : stocké pour l'évaluation,
                                        JAMAIS transmis au détecteur ni à l'agrégation

Règles : round_id strictement croissant (409 sinon) ; valeurs numériques finies (omettre un
oracle qui n'a pas répondu) ; la valeur n'est envoyée au pont que si
confidence >= CHAIN_MIN_CONFIDENCE (aligner sur le seuil du smart contract, 0.70 par défaut),
sinon "SKIPPED". Si le pont est en panne, le round reste enregistré avec chain_status "ERROR".

IMPORTANT déploiement : l'état (réputations) est en mémoire -> UN SEUL processus worker
(ex. gunicorn --workers 1 --threads 4 "backend.api:create_app()").
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import threading

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from oraclebench.pipeline import RoundOrderError, RoundProcessor

from .bridge import BridgeError, create_bridge
from .storage_base import json_safe
from .storage_factory import create_store

ORACLE_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
log = logging.getLogger("oraclebench.api")


class ValidationError(Exception):
    def __init__(self, message: str, details=None):
        super().__init__(message)
        self.message, self.details = message, details


def _is_number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def parse_round_payload(data, max_oracles: int = 1000):
    if not isinstance(data, dict):
        raise ValidationError("le corps doit être un objet JSON")
    rid = data.get("round_id")
    if isinstance(rid, bool) or not isinstance(rid, int) or rid < 0:
        raise ValidationError("round_id doit être un entier >= 0")
    obs = data.get("observations")
    if not isinstance(obs, list) or not obs:
        raise ValidationError("observations doit être une liste non vide")
    if len(obs) > max_oracles:
        raise ValidationError(f"trop d'observations (maximum {max_oracles})")
    seen, clean = set(), []
    for i, o in enumerate(obs):
        if not isinstance(o, dict):
            raise ValidationError(f"observations[{i}] doit être un objet")
        oid = o.get("oracle_id")
        if not isinstance(oid, str) or not ORACLE_ID_RE.match(oid):
            raise ValidationError(f"observations[{i}].oracle_id invalide (1 à 64 caractères : lettres, chiffres, _ . -)")
        if oid in seen:
            raise ValidationError(f"oracle_id en double : {oid!r}")
        seen.add(oid)
        if not _is_number(o.get("value")):
            raise ValidationError(f"observations[{i}].value doit être un nombre fini (omettre l'oracle s'il n'a pas répondu)")
        clean.append({"oracle_id": oid, "value": float(o["value"])})
    gt = data.get("ground_truth")
    if gt is not None and not _is_number(gt):
        raise ValidationError("ground_truth doit être un nombre fini ou absent")
    return rid, clean, (None if gt is None else float(gt))


def _err(status: int, message: str, details=None):
    body = {"error": message}
    if details is not None:
        body["details"] = details
    return jsonify(body), status


def create_app(store=None, bridge=None, processor=None, config: dict | None = None) -> Flask:
    cfg = {
        "run_id": os.getenv("RUN_ID", "default"),
        "chain_min_confidence": float(os.getenv("CHAIN_MIN_CONFIDENCE", "0.7")),
        "max_content_length": int(os.getenv("MAX_CONTENT_LENGTH", str(1024 * 1024))),
        "max_oracles": int(os.getenv("MAX_ORACLES", "1000")),
        "cors_origins": os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"),
        "pipeline": None,
    }
    cfg.update(config or {})

    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = cfg["max_content_length"]
    CORS(app, origins=[o.strip() for o in str(cfg["cors_origins"]).split(",") if o.strip()])

    store = store or create_store(run_id=cfg["run_id"])
    bridge = bridge or create_bridge()
    if processor is None:
        processor = RoundProcessor(cfg["pipeline"])
        processor.restore_from_store(store)
    lock = threading.Lock()
    min_conf = float(cfg["chain_min_confidence"])

    # ----------------------------------------------------------- pont ---
    def send_to_chain(round_id: int) -> dict:
        """Envoie le round au pont et enregistre le résultat. Renvoie le bloc `blockchain`."""
        r = store.get_round(round_id)
        fv, conf = r["final_value"], r["confidence"]
        if fv is None or conf < min_conf:
            store.update_blockchain(round_id, None, None, "SKIPPED")
            return {"tx_hash": None, "gas_used": None, "status": "SKIPPED"}
        try:
            res = bridge.record(round_id, fv, conf, r["proof_hash"])
        except Exception as e:      # le round est déjà stocké : une panne du pont ne doit JAMAIS faire échouer la requête
            known = isinstance(e, BridgeError)
            log.warning("pont indisponible pour le round %s : %s", round_id, e, exc_info=not known)
            store.update_blockchain(round_id, None, None, "ERROR")
            return {"tx_hash": None, "gas_used": None, "status": "ERROR",
                    "error": str(e) if known else "erreur interne du client du pont"}
        store.update_blockchain(round_id, res["tx_hash"], res["gas_used"], res["status"])
        return {"tx_hash": res["tx_hash"], "gas_used": res["gas_used"], "status": res["status"]}

    # ------------------------------------------------------- erreurs ---
    @app.errorhandler(ValidationError)
    def _validation(e):
        return _err(400, e.message, e.details)

    @app.errorhandler(HTTPException)
    def _http(e):
        return _err(e.code, e.description)

    @app.errorhandler(Exception)
    def _unexpected(e):
        log.exception("erreur interne")
        return _err(500, "erreur interne")          # pas de détail technique envoyé au client

    # -------------------------------------------------------- routes ---
    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "run_id": store.run_id, "storage": type(store).__name__,
                        "bridge": bridge.mode, "latest_round_id": store.latest_round_id()})

    @app.post("/round")
    def post_round():
        if not request.is_json:
            return _err(415, "Content-Type doit être application/json")
        data = request.get_json(silent=True)
        if data is None:
            return _err(400, "JSON invalide")
        round_id, observations, ground_truth = parse_round_payload(data, cfg["max_oracles"])
        with lock:
            try:
                prepared = processor.prepare(round_id, observations)
            except RoundOrderError as e:
                return _err(409, str(e))
            store.save_round(round_id, prepared.result, ground_truth=ground_truth,
                             methods=prepared.result["methods"])
            processor.commit(prepared)               # l'état n'avance qu'après une sauvegarde réussie
            chain = send_to_chain(round_id)
        out = store.get_round(round_id)
        out["blockchain"] = {**out["blockchain"], **chain}
        return jsonify(out), 201

    @app.get("/round/<int:round_id>")
    @app.get("/rounds/<int:round_id>")
    def get_round(round_id):
        r = store.get_round(round_id)
        return jsonify(r) if r is not None else _err(404, f"round {round_id} introuvable")

    @app.get("/rounds")
    def list_rounds():
        try:
            limit = int(request.args.get("limit", 100))
        except ValueError:
            return _err(400, "limit doit être un entier")
        if not 1 <= limit <= 1000:
            return _err(400, "limit doit être entre 1 et 1000")
        order = request.args.get("order", "desc")
        if order not in ("asc", "desc"):
            return _err(400, "order doit être asc ou desc")
        df = store.list_rounds(limit=limit, descending=(order == "desc"))
        cols = ["round_id", "timestamp", "final_value", "confidence", "n_accepted", "ground_truth",
                "proof_hash", "tx_hash", "gas_used", "chain_status"]
        rows = json.loads(df[cols].to_json(orient="records")) if len(df) else []

        # Support direct format array (conformité OpenAPI et dashboard)
        if request.args.get("format") == "array" or request.headers.get("X-Format") == "array":
            if request.args.get("full") == "true":
                full_rounds = [store.get_round(int(r["round_id"])) for r in rows]
                return jsonify(json_safe(full_rounds))
            return jsonify(json_safe(rows))

        return jsonify({"run_id": store.run_id, "total": store.count(), "rounds": json_safe(rows)})

    @app.get("/experiments/summary")
    def experiments_summary():
        candidate_paths = [
            os.getenv("EXPERIMENTS_SUMMARY_PATH"),
            "experiments/results/experiments_summary.json",
            "dashboard/mocks/experiments_summary.json",
            "../dashboard/mocks/experiments_summary.json",
            "data/experiments_summary.json",
        ]
        for p in candidate_paths:
            if p and os.path.isfile(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        return jsonify(json.load(f))
                except Exception as e:
                    log.warning("erreur lecture %s: %s", p, e)
        return _err(404, "synthèse des expériences indisponible")

    @app.get("/reputation")
    def reputation():
        return jsonify({"last_round_id": processor.last_round_id, "reputation": processor.reputation.get()})

    @app.post("/round/<int:round_id>/record")
    def retry_record(round_id):
        r = store.get_round(round_id)
        if r is None:
            return _err(404, f"round {round_id} introuvable")
        if r["blockchain"]["status"] in ("VERIFIED", "CONFIRMED"):
            return _err(409, "round déjà enregistré sur la blockchain")
        with lock:
            send_to_chain(round_id)
        return jsonify(store.get_round(round_id))

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_app().run(host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5000")))
