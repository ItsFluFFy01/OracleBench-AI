"""
Score de confiance d'un round (Personne B).

Le score répond à : « à quel point peut-on se fier à la valeur agrégée de CE round ? »
Il ne dépend JAMAIS de la vérité terrain. Formule (moyenne géométrique pondérée) :

    confidence = agreement^w_a * reputation^w_r * coverage^w_c * quorum^w_q      (poids normalisés)

  accepted   = oracles NON signalés, avec une valeur finie
  agreement  = max(0, 1 - dispersion_relative / disp_tol_rel)
               dispersion_relative = (1.4826 * MAD des valeurs acceptées) / |médiane|
               -> 1 si les oracles acceptés sont d'accord, 0 si dispersion >= disp_tol_rel
  reputation = moyenne des réputations des oracles acceptés
  coverage   = |accepted| / |oracles ayant répondu|        (part des sources conservées)
  quorum     = min(1, |accepted| / min_sources)             (assez de sources indépendantes ?)

Propriétés : résultat dans [0, 1] ; vaut 0 si aucune source acceptée ou si un terme pèse 0 ;
la moyenne géométrique empêche qu'un terme excellent compense un terme désastreux.

Contrat : compute_confidence(values, rep, flags) -> float
  values : {oracle_id: valeur}   rep : {oracle_id: réputation}   flags : {oracle_id: True si suspect}
"""
from __future__ import annotations

from dataclasses import dataclass, field, fields
from typing import Mapping

import numpy as np

MAD_TO_STD = 1.4826


@dataclass
class ConfidenceConfig:
    min_sources: int = 3            # nombre minimal de sources acceptées pour un quorum complet
    disp_tol_rel: float = 0.05      # dispersion relative (5 %) à partir de laquelle agreement = 0
    disp_scale: float | None = None # échelle absolue fixe (si la grandeur peut passer par 0)
    default_rep: float = 0.5        # réputation supposée d'un oracle absent de `rep`
    weights: dict = field(default_factory=lambda: {
        "agreement": 0.30, "reputation": 0.25, "coverage": 0.20, "quorum": 0.25})

    def __post_init__(self):
        if self.min_sources < 1:
            raise ValueError("min_sources doit être >= 1")
        if self.disp_tol_rel <= 0:
            raise ValueError("disp_tol_rel doit être > 0")
        keys = {"agreement", "reputation", "coverage", "quorum"}
        if set(self.weights) != keys or any(v < 0 for v in self.weights.values()) \
                or sum(self.weights.values()) <= 0:
            raise ValueError(f"weights doit contenir {sorted(keys)} (>= 0, somme > 0)")

    @classmethod
    def from_dict(cls, d: Mapping | None) -> "ConfidenceConfig":
        if not d:
            return cls()
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in names})


def _as_cfg(cfg) -> ConfidenceConfig:
    return cfg if isinstance(cfg, ConfidenceConfig) else ConfidenceConfig.from_dict(cfg)


def confidence_breakdown(values: Mapping, rep: Mapping, flags: Mapping, cfg=None) -> dict:
    """Détail des 4 termes + score final (utile pour le dashboard et le rapport)."""
    if not isinstance(values, Mapping):
        raise TypeError("values doit être un dict {oracle_id: valeur}")
    c = _as_cfg(cfg)

    answered = {o: float(v) for o, v in values.items() if np.isfinite(v)}
    accepted = {o: v for o, v in answered.items() if not bool(flags.get(o, False))}
    n_ans, n_acc = len(answered), len(accepted)

    zero = {"agreement": 0.0, "reputation": 0.0, "coverage": 0.0, "quorum": 0.0,
            "n_answered": n_ans, "n_accepted": n_acc, "confidence": 0.0}
    if n_acc == 0:
        return zero

    vals = np.array(list(accepted.values()))
    med = float(np.median(vals))
    sigma = MAD_TO_STD * float(np.median(np.abs(vals - med)))
    denom = c.disp_scale if c.disp_scale else max(abs(med), 1e-9)
    agreement = max(0.0, 1.0 - (sigma / denom) / c.disp_tol_rel)

    reputation = float(np.mean([min(1.0, max(0.0, rep.get(o, c.default_rep))) for o in accepted]))
    coverage = n_acc / n_ans
    quorum = min(1.0, n_acc / c.min_sources)

    terms = {"agreement": agreement, "reputation": reputation, "coverage": coverage, "quorum": quorum}
    wsum = sum(c.weights.values())
    if any(terms[k] <= 0 and c.weights[k] > 0 for k in terms):
        conf = 0.0
    else:
        conf = float(np.exp(sum(c.weights[k] / wsum * np.log(terms[k])
                                for k in terms if c.weights[k] > 0)))
    return {**terms, "n_answered": n_ans, "n_accepted": n_acc, "confidence": min(1.0, max(0.0, conf))}


def compute_confidence(values: Mapping, rep: Mapping, flags: Mapping, cfg=None) -> float:
    """Fonction du contrat : score de confiance dans [0, 1]."""
    return confidence_breakdown(values, rep, flags, cfg)["confidence"]