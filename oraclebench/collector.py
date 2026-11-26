"""Collecte et normalisation des observations d'oracles par round."""

from datetime import datetime, timezone

import numpy as np
import pandas as pd

from oraclebench.attacks import inject_attacks
from oraclebench.oracle_nodes import init_oracles, simulate_nodes_round

OBSERVATION_COLUMNS = [
    "oracle_id",
    "round_id",
    "timestamp",
    "value",
    "profile",
    "attack",
]


def normalize_observation(obs: dict, round_id: int, timestamp: str) -> dict:
    """Normalise une observation brute au format commun du projet.

    Args:
        obs: Dictionnaire contenant ``oracle_id``, ``profile``, ``attack`` et ``value``.
        round_id: Identifiant du round courant.
        timestamp: Horodatage UTC ISO-8601 partagé par tout le round.

    Returns:
        Observation normalisée conforme au contrat commun.
    """
    required = ("oracle_id", "profile", "attack", "value")
    for field in required:
        if field not in obs:
            raise ValueError(f"Champ obligatoire manquant dans l'observation : '{field}'.")

    return {
        "oracle_id": str(obs["oracle_id"]),
        "round_id": int(round_id),
        "timestamp": str(timestamp),
        "value": round(float(obs["value"]), 2),
        "profile": str(obs["profile"]),
        "attack": str(obs["attack"]),
    }


def simulate_round(cfg: dict, round_id: int, truth: float, state: dict) -> list[dict]:
    """Simule un round complet et retourne les observations normalisées.

    Conserve ``rng``, ``oracles`` et l'état des attaques dans ``state``
    entre les appels successifs afin d'assurer la reproductibilité.

    Args:
        cfg: Dictionnaire de configuration de l'expérience.
        round_id: Identifiant numérique du round.
        truth: Valeur de vérité terrain du round en USD.
        state: Dictionnaire d'état persistant entre les rounds.

    Returns:
        Liste des observations normalisées du round.
    """
    if "rng" not in state:
        seed = cfg.get("seed", 42)
        state["rng"] = np.random.default_rng(seed)

    rng = state["rng"]

    if "oracles" not in state:
        state["oracles"] = init_oracles(cfg, rng)

    oracles = state["oracles"]
    round_timestamp = datetime.now(timezone.utc).isoformat()

    base_obs = simulate_nodes_round(oracles, truth, cfg, rng)
    attacked_obs = inject_attacks(base_obs, truth, cfg, state, rng)

    return [
        normalize_observation(obs, round_id, round_timestamp)
        for obs in attacked_obs
    ]


def observations_to_dataframe(observations: list[dict]) -> pd.DataFrame:
    """Convertit une liste d'observations normalisées en DataFrame Pandas.

    Args:
        observations: Liste d'observations issue de ``simulate_round``.

    Returns:
        DataFrame avec les colonnes ordonnées du format commun.
    """
    if not observations:
        return pd.DataFrame(columns=OBSERVATION_COLUMNS)
    return pd.DataFrame(observations, columns=OBSERVATION_COLUMNS)
