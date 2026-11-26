"""Injection des attaques (spike, stale, collusion) sur les observations d'oracles."""

import numpy as np

VALID_ATTACKS = ("none", "spike", "stale", "collusion")


def select_attacked_oracles(
    observations: list[dict],
    cfg: dict,
    state: dict,
    rng: np.random.Generator,
    force_reselect: bool = False,
) -> set[str]:
    """Sélectionne et mémorise les oracles ciblés par l'attaque dans ``state``.

    La sélection est effectuée une seule fois puis conservée dans
    ``state["attacked_oracles"]`` d'un round à l'autre, sauf si
    ``force_reselect=True``.

    Args:
        observations: Liste d'observations du round courant.
        cfg: Configuration pouvant contenir ``attacked_oracles`` (liste explicite)
            ou ``pct_bad`` (proportion entre 0.0 et 1.0, défaut: 0.0).
        state: Dictionnaire d'état persistant entre les rounds.
        rng: Générateur aléatoire NumPy partagé.
        force_reselect: Force une nouvelle sélection même si elle existe déjà.

    Returns:
        Ensemble des ``oracle_id`` sélectionnés pour l'attaque.
    """
    if "attacked_oracles" in state and not force_reselect:
        return state["attacked_oracles"]

    explicit = cfg.get("attacked_oracles")
    if explicit is not None:
        valid_ids = {obs["oracle_id"] for obs in observations}
        selected = set(explicit)
        unknown = selected - valid_ids
        if unknown:
            raise ValueError(
                f"Identifiants inconnus dans 'attacked_oracles' : {sorted(unknown)}."
            )
    else:
        pct_bad = float(cfg.get("pct_bad", 0.0))
        if not 0.0 <= pct_bad <= 1.0:
            raise ValueError("Le paramètre 'pct_bad' doit être compris entre 0.0 et 1.0.")

        oracle_ids = [obs["oracle_id"] for obs in observations]
        n_bad = int(round(len(oracle_ids) * pct_bad))
        if n_bad == 0:
            selected = set()
        else:
            chosen = rng.choice(oracle_ids, size=n_bad, replace=False)
            selected = set(str(oid) for oid in chosen)

    state["attacked_oracles"] = selected
    return selected


def inject_attacks(
    observations: list[dict],
    truth: float,
    cfg: dict,
    state: dict,
    rng: np.random.Generator,
) -> list[dict]:
    """Applique l'attaque configurée aux oracles ciblés tout en préservant ``profile``.

    Args:
        observations: Observations de base issues de ``simulate_nodes_round()``.
        truth: Valeur de vérité terrain du round en USD.
        cfg: Configuration pouvant contenir :
            - attack (str): ``none``, ``spike``, ``stale`` ou ``collusion``.
            - spike_offset (float): Saut en USD pour ``spike`` (défaut: 600.0).
            - spike_prob (float): Probabilité de déclenchement par round (défaut: 0.3).
            - collusion_offset (float): Décalage en USD pour ``collusion`` (défaut: 250.0).
        state: Dictionnaire d'état partagé entre les rounds (oracles ciblés et valeurs figées).
        rng: Générateur aléatoire NumPy partagé.

    Returns:
        Nouvelle liste d'observations avec ``oracle_id``, ``profile``, ``attack`` et ``value``.
    """
    attack_type = str(cfg.get("attack", "none"))
    if attack_type not in VALID_ATTACKS:
        raise ValueError(
            f"Attaque inconnue '{attack_type}'. Attaques valides : {VALID_ATTACKS}."
        )

    spike_offset = float(cfg.get("spike_offset", 600.0))
    spike_prob = float(cfg.get("spike_prob", 0.3))
    if not 0.0 <= spike_prob <= 1.0:
        raise ValueError("Le paramètre 'spike_prob' doit être compris entre 0.0 et 1.0.")
    collusion_offset = float(cfg.get("collusion_offset", 250.0))

    force_reselect = bool(cfg.get("force_reselect", False))
    attacked = (
        select_attacked_oracles(observations, cfg, state, rng, force_reselect)
        if attack_type != "none"
        else set()
    )

    last_values = state.setdefault("last_values", {})
    stale_values = state.setdefault("stale_values", {})
    collusion_value = round(float(truth + collusion_offset), 2)

    result = []
    for obs in observations:
        oid = obs["oracle_id"]
        raw_value = float(obs["value"])
        value = raw_value
        applied_attack = "none"

        if oid in attacked:
            if attack_type == "spike":
                if rng.random() < spike_prob:
                    value = round(raw_value + spike_offset, 2)
                    applied_attack = "spike"
            elif attack_type == "stale":
                if oid in stale_values:
                    value = stale_values[oid]
                    applied_attack = "stale"
                else:
                    # Fige la valeur de référence précédente (ou initiale au 1er round)
                    frozen = last_values.get(oid, raw_value)
                    stale_values[oid] = frozen
                    value = frozen
                    if oid in last_values:
                        applied_attack = "stale"
            elif attack_type == "collusion":
                value = collusion_value
                applied_attack = "collusion"

        last_values[oid] = raw_value
        result.append(
            {
                "oracle_id": oid,
                "profile": obs["profile"],
                "attack": applied_attack,
                "value": round(float(value), 2),
            }
        )

    return result
