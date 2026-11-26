"""Générateur de vérité terrain (Ground Truth) pour le scénario ETH/USD."""

import numpy as np


def generate_ground_truth(cfg: dict, seed: int) -> list[float]:
    """Génère une série temporelle synthétique de prix ETH/USD reproductible.

    Args:
        cfg: Dictionnaire de configuration pouvant contenir :
            - rounds (int): Nombre de rounds à générer (défaut: 100).
            - base_value (float): Prix initial ETH/USD (défaut: 3420.50).
            - amplitude (float): Amplitude de la sinusoïde en USD (défaut: 25.0).
            - period (float): Période du cycle en rounds (défaut: 50.0).
            - trend (float): Tendance linéaire par round en USD (défaut: 0.2).
            - noise_std (float): Écart-type du bruit gaussien en USD (défaut: 5.0).
        seed: Graine aléatoire garantissant la reproductibilité.

    Returns:
        Liste de prix ETH/USD (float) de longueur ``rounds``.
    """
    rounds = int(cfg.get("rounds", 100))
    base_value = float(cfg.get("base_value", 3420.50))
    amplitude = float(cfg.get("amplitude", 25.0))
    period = float(cfg.get("period", 50.0))
    trend = float(cfg.get("trend", 0.2))
    noise_std = float(cfg.get("noise_std", 5.0))

    if rounds < 1:
        raise ValueError("Le paramètre 'rounds' doit être supérieur ou égal à 1.")
    if period <= 0:
        raise ValueError("Le paramètre 'period' doit être strictement positif.")

    rng = np.random.default_rng(seed)
    indices = np.arange(rounds, dtype=float)

    seasonal = amplitude * np.sin(2.0 * np.pi * indices / period)
    linear_trend = trend * indices
    noise = rng.normal(loc=0.0, scale=noise_std, size=rounds)

    series = base_value + seasonal + linear_trend + noise
    return [round(float(val), 2) for val in series]
