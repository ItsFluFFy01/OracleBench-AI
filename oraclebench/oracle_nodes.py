"""Simulation des nœuds oracles et de leurs profils de base (normal, noisy, biased)."""

import numpy as np

VALID_PROFILES = ("normal", "noisy", "biased")


def init_oracles(cfg: dict, rng: np.random.Generator | None = None) -> list[dict]:
    """Initialise la liste des N oracles avec leur identifiant et leur profil.

    Args:
        cfg: Dictionnaire de configuration pouvant contenir :
            - profiles (list[str]): Liste explicite des profils par oracle.
            - n_oracles (int): Nombre d'oracles si ``profiles`` n'est pas fourni (défaut: 5).
            - profile_ratios (dict[str, float]): Proportions optionnelles pour
              ``normal``, ``noisy`` et ``biased`` (par défaut tous ``normal``).
        rng: Générateur aléatoire NumPy pour mélanger les profils de façon reproductible.

    Returns:
        Liste de dictionnaires ``{"oracle_id": str, "profile": str}``.
    """
    explicit_profiles = cfg.get("profiles")
    if explicit_profiles is not None:
        if len(explicit_profiles) < 1:
            raise ValueError("La liste 'profiles' doit contenir au moins un oracle.")
        profiles = []
        for profile in explicit_profiles:
            if profile not in VALID_PROFILES:
                raise ValueError(
                    f"Profil inconnu '{profile}'. Profils valides : {VALID_PROFILES}."
                )
            profiles.append(profile)
    else:
        n_oracles = int(cfg.get("n_oracles", 5))
        if n_oracles < 1:
            raise ValueError("Le paramètre 'n_oracles' doit être supérieur ou égal à 1.")

        ratios = cfg.get("profile_ratios")
        if ratios is None:
            profiles = ["normal"] * n_oracles
        else:
            n_noisy = int(round(n_oracles * float(ratios.get("noisy", 0.0))))
            n_biased = int(round(n_oracles * float(ratios.get("biased", 0.0))))
            if n_noisy + n_biased > n_oracles:
                raise ValueError(
                    "La somme des proportions 'noisy' et 'biased' dépasse 1.0."
                )
            n_normal = n_oracles - n_noisy - n_biased
            profiles = (
                ["normal"] * n_normal
                + ["noisy"] * n_noisy
                + ["biased"] * n_biased
            )
            if rng is not None:
                rng.shuffle(profiles)

    return [
        {"oracle_id": f"oracle_{i:02d}", "profile": profile}
        for i, profile in enumerate(profiles, start=1)
    ]


def generate_node_value(
    truth: float,
    profile: str,
    cfg: dict,
    rng: np.random.Generator,
) -> float:
    """Calcule la valeur observée par un oracle selon son profil de base.

    Args:
        truth: Valeur de vérité terrain du round en USD.
        profile: Profil de l'oracle (``normal``, ``noisy`` ou ``biased``).
        cfg: Dictionnaire de configuration pouvant contenir :
            - normal_noise_std (float): Écart-type pour ``normal`` (défaut: 3.0).
            - noisy_noise_std (float): Écart-type pour ``noisy`` (défaut: 35.0).
            - bias_offset (float): Biais constant pour ``biased`` (défaut: 50.0).
        rng: Générateur aléatoire NumPy partagé pour la reproductibilité.

    Returns:
        Valeur observée arrondie à 2 décimales (USD).
    """
    normal_std = float(cfg.get("normal_noise_std", 3.0))
    noisy_std = float(cfg.get("noisy_noise_std", 35.0))
    bias_offset = float(cfg.get("bias_offset", 50.0))

    if profile == "normal":
        value = truth + rng.normal(loc=0.0, scale=normal_std)
    elif profile == "noisy":
        value = truth + rng.normal(loc=0.0, scale=noisy_std)
    elif profile == "biased":
        value = truth + bias_offset + rng.normal(loc=0.0, scale=normal_std)
    else:
        raise ValueError(
            f"Profil inconnu '{profile}'. Profils valides : {VALID_PROFILES}."
        )

    return round(float(value), 2)


def simulate_nodes_round(
    oracles: list[dict],
    truth: float,
    cfg: dict,
    rng: np.random.Generator,
) -> list[dict]:
    """Simule les observations de base de tous les oracles pour un round.

    Args:
        oracles: Liste des oracles issue de ``init_oracles``.
        truth: Valeur de vérité terrain du round en USD.
        cfg: Dictionnaire de configuration des bruits et biais.
        rng: Générateur aléatoire NumPy partagé.

    Returns:
        Liste de dictionnaires contenant ``oracle_id``, ``profile`` et ``value``.
    """
    return [
        {
            "oracle_id": oracle["oracle_id"],
            "profile": oracle["profile"],
            "value": generate_node_value(truth, oracle["profile"], cfg, rng),
        }
        for oracle in oracles
    ]
