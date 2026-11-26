"""Métriques d'évaluation de la valeur agrégée : MAE, RMSE et erreur relative."""

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error


def _validate_series(
    y_true: list[float],
    y_pred: list[float],
) -> tuple[np.ndarray, np.ndarray]:
    """Valide et convertit les séries ``y_true`` et ``y_pred`` en tableaux NumPy."""
    if not y_true or not y_pred:
        raise ValueError("Les séries 'y_true' et 'y_pred' ne doivent pas être vides.")
    if len(y_true) != len(y_pred):
        raise ValueError(
            f"Longueurs incompatibles : y_true ({len(y_true)}) != y_pred ({len(y_pred)})."
        )
    true_arr = np.asarray(y_true, dtype=float)
    pred_arr = np.asarray(y_pred, dtype=float)
    if not np.all(np.isfinite(true_arr)) or not np.all(np.isfinite(pred_arr)):
        raise ValueError(
            "Les séries 'y_true' et 'y_pred' ne doivent contenir ni NaN ni valeurs infinies."
        )
    return true_arr, pred_arr


def compute_mae(y_true: list[float], y_pred: list[float]) -> float:
    """Calcule la Mean Absolute Error (MAE) en USD."""
    true_arr, pred_arr = _validate_series(y_true, y_pred)
    return round(float(mean_absolute_error(true_arr, pred_arr)), 2)


def compute_rmse(y_true: list[float], y_pred: list[float]) -> float:
    """Calcule la Root Mean Squared Error (RMSE) en USD."""
    true_arr, pred_arr = _validate_series(y_true, y_pred)
    return round(float(np.sqrt(mean_squared_error(true_arr, pred_arr))), 2)


def compute_relative_error(y_true: list[float], y_pred: list[float]) -> float:
    """Calcule l'erreur relative moyenne en pourcentage (%)."""
    true_arr, pred_arr = _validate_series(y_true, y_pred)
    if np.any(true_arr == 0.0):
        raise ValueError(
            "Impossible de calculer l'erreur relative : 'y_true' contient une valeur nulle."
        )
    rel_pct = 100.0 * np.mean(np.abs(true_arr - pred_arr) / np.abs(true_arr))
    return round(float(rel_pct), 2)


def compute_value_metrics(
    y_true: list[float],
    y_pred: list[float],
) -> dict[str, float]:
    """Calcule simultanément MAE, RMSE et erreur relative (%).

    Returns:
        Dictionnaire ``{"mae": float, "rmse": float, "relative_error_pct": float}``.
    """
    return {
        "mae": compute_mae(y_true, y_pred),
        "rmse": compute_rmse(y_true, y_pred),
        "relative_error_pct": compute_relative_error(y_true, y_pred),
    }


def compute_round_error(truth: float, predicted: float) -> float:
    """Calcule l'erreur absolue ponctuelle d'un round en USD."""
    return round(abs(float(truth) - float(predicted)), 2)
