"""
Moteur de réputation (Personne B).

Règle (bornée dans [min_rep, 1], paramétrable, réversible) :
  - oracle signalé (suspect)  : pénalité = penalty * min(série_de_signalements, streak_cap)
                                -> une erreur isolée coûte peu, une récidive coûte plus cher
  - oracle normal             : récompense = reward
                                + si stable depuis `stable_after` rounds : reward * recovery_boost
                                -> récupération progressive, jamais irréversible
  - nouvel oracle (absent de `rep`) : démarre à `newcomer_rep` (< initial) pour ne pas
                                avoir un poids excessif
  - oracle absent d'un round  : réputation inchangée

Contrat figé : update_reputation(rep: dict, flags: dict, cfg) -> dict
  flags : {oracle_id: True/False}  (True = suspect). Seuiller les scores AVANT (ex. score >= 0.5).
"""
from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Mapping

import numpy as np


@dataclass
class ReputationConfig:
    initial: float = 1.0          # réputation des oracles présents au départ
    newcomer_rep: float = 0.5     # réputation d'un oracle ajouté en cours de route
    reward: float = 0.02          # gain par round normal
    penalty: float = 0.10         # pénalité de base par signalement
    streak_cap: int = 3           # multiplicateur max de la pénalité (récidive)
    stable_after: int = 10        # rounds normaux consécutifs avant bonus de récupération
    recovery_boost: float = 2.0   # multiplicateur de la récompense une fois stable
    min_rep: float = 0.0
    max_rep: float = 1.0

    def __post_init__(self):
        if not (0.0 <= self.min_rep <= self.max_rep <= 1.0):
            raise ValueError("il faut 0 <= min_rep <= max_rep <= 1")
        for name in ("initial", "newcomer_rep"):
            if not (self.min_rep <= getattr(self, name) <= self.max_rep):
                raise ValueError(f"{name} doit être dans [min_rep, max_rep]")
        if self.reward < 0 or self.penalty < 0:
            raise ValueError("reward et penalty doivent être >= 0")

    @classmethod
    def from_dict(cls, d: Mapping | None) -> "ReputationConfig":
        if not d:
            return cls()
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in names})


def _as_cfg(cfg) -> ReputationConfig:
    return cfg if isinstance(cfg, ReputationConfig) else ReputationConfig.from_dict(cfg)


def _as_bool(oracle_id, v) -> bool:
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if isinstance(v, (int, np.integer)) and v in (0, 1):
        return bool(v)
    raise TypeError(f"flags[{oracle_id!r}]={v!r} : booléen attendu. "
                    "Seuiller les scores d'anomalie avant (score >= seuil).")


def update_reputation(rep: dict, flags: dict, cfg=None, state: dict | None = None) -> dict:
    """Retourne la nouvelle réputation (n'écrase pas `rep`).

    state : dict optionnel {"bad": {...}, "good": {...}} qui mémorise les séries
            consécutives entre deux appels (modifié en place). Sans state, les séries
            repartent de 0 à chaque appel : préférer ReputationEngine.
    """
    c = _as_cfg(cfg)
    st = state if state is not None else {}
    bad = st.setdefault("bad", {})
    good = st.setdefault("good", {})

    new = dict(rep)
    for oid in flags:
        if oid not in new:
            new[oid] = c.newcomer_rep if rep else c.initial   # 1er round : tout le monde démarre à `initial`

    for oid, raw in flags.items():
        r = new[oid]
        if _as_bool(oid, raw):
            bad[oid] = bad.get(oid, 0) + 1
            good[oid] = 0
            r -= c.penalty * min(bad[oid], c.streak_cap)
        else:
            good[oid] = good.get(oid, 0) + 1
            bad[oid] = 0
            gain = c.reward * (c.recovery_boost if good[oid] >= c.stable_after else 1.0)
            r += gain
        new[oid] = float(min(c.max_rep, max(c.min_rep, r)))
    return new


class ReputationEngine:
    """Version à état : une instance par run d'expérience."""

    def __init__(self, cfg=None, oracle_ids=None):
        self.cfg = _as_cfg(cfg)
        self.reset(oracle_ids)

    def reset(self, oracle_ids=None) -> None:
        self.rep: dict = {o: self.cfg.initial for o in (oracle_ids or [])}
        self._state: dict = {"bad": {}, "good": {}}

    def update(self, flags: dict) -> dict:
        self.rep = update_reputation(self.rep, flags, self.cfg, self._state)
        return dict(self.rep)

    def get(self) -> dict:
        return dict(self.rep)


def degradation_recovery_time(cfg=None, low: float = 0.5, high: float = 0.9,
                              max_rounds: int = 1000) -> dict:
    """Temps (en rounds) pour qu'un oracle parfait tombe sous `low` s'il est signalé à
    chaque round, puis remonte au-dessus de `high` s'il redevient normal.
    Alimente la métrique « temps de dégradation / récupération » de l'énoncé."""
    eng = ReputationEngine(cfg, ["X"])
    down = None
    for t in range(1, max_rounds + 1):
        if eng.update({"X": True})["X"] < low:
            down = t
            break
    up = None
    if down is not None:
        for t in range(1, max_rounds + 1):
            if eng.update({"X": False})["X"] > high:
                up = t
                break
    return {"rounds_to_degrade": down, "rounds_to_recover": up}