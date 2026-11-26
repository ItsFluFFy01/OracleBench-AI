"""Méthodes d'agrégation classiques (baselines) : mean, median, trimmed mean."""

import numpy as np

VALID_METHODS = ("mean", "median", "trimmed")


def trimmed_mean(values: list[float], trim_ratio: float = 0.2) -> float:
    """Calcule la moyenne tronquée en supprimant les extrêmes aux deux bornes.

    Si le nombre de valeurs est trop faible pour effectuer une troncature,
    revient à la moyenne des valeurs disponibles.

    Args:
        values: Liste de valeurs numériques non vide.
        trim_ratio: Proportion à retirer à chaque extrémité dans ``[0.0, 0.5[``.

    Returns:
        Moyenne tronquée arrondie à 2 décimales.
    """
    if not values:
        raise ValueError("La liste 'values' ne doit pas être vide.")
    if not 0.0 <= trim_ratio < 0.5:
        raise ValueError("Le paramètre 'trim_ratio' doit être dans [0.0, 0.5[.")

    sorted_vals = np.sort(np.asarray(values, dtype=float))
    k = int(len(sorted_vals) * trim_ratio)

    if k == 0 or 2 * k >= len(sorted_vals):
        result = float(np.mean(sorted_vals))
    else:
        result = float(np.mean(sorted_vals[k:-k]))

    return round(result, 2)


def aggregate_baseline(
    values: list[float],
    method: str,
    trim_ratio: float = 0.2,
) -> float:
    """Agrège une liste de valeurs selon la méthode baseline demandée.

    Args:
        values: Liste des valeurs d'oracles d'un round.
        method: Méthode d'agrégation (``mean``, ``median`` ou ``trimmed``).
        trim_ratio: Proportion de troncature utilisée pour ``trimmed`` (défaut: 0.2).

    Returns:
        Valeur agrégée arrondie à 2 décimales (USD).
    """
    if not values:
        raise ValueError("La liste 'values' ne doit pas être vide.")
    if method not in VALID_METHODS:
        raise ValueError(
            f"Méthode inconnue '{method}'. Méthodes valides : {VALID_METHODS}."
        )

    arr = np.asarray(values, dtype=float)
    if method == "mean":
        return round(float(np.mean(arr)), 2)
    if method == "median":
        return round(float(np.median(arr)), 2)
    return trimmed_mean(values, trim_ratio=trim_ratio)


def aggregate_all_baselines(
    values: list[float],
    trim_ratio: float = 0.2,
) -> dict[str, float]:
    """Calcule simultanément toutes les baselines (mean, median, trimmed).

    Args:
        values: Liste des valeurs d'oracles d'un round.
        trim_ratio: Proportion de troncature utilisée pour ``trimmed``.

    Returns:
        Dictionnaire ``{"mean": float, "median": float, "trimmed": float}``.
    """
    return {
        method: aggregate_baseline(values, method, trim_ratio=trim_ratio)
        for method in VALID_METHODS
    }
