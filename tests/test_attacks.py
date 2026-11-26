"""Tests unitaires pour oraclebench/attacks.py."""

import unittest

import numpy as np

from oraclebench.attacks import inject_attacks
from oraclebench.oracle_nodes import init_oracles, simulate_nodes_round


class TestAttacks(unittest.TestCase):
    """Vérifie les attaques spike, stale, collusion et la persistance de state."""

    def test_collusion_identical_false_values_and_state_persistence(self) -> None:
        rng = np.random.default_rng(42)
        cfg = {"n_oracles": 5, "attack": "collusion", "pct_bad": 0.4, "collusion_offset": 250.0}
        oracles = init_oracles(cfg, rng)
        state: dict = {}

        r1 = inject_attacks(simulate_nodes_round(oracles, 3420.50, cfg, rng), 3420.50, cfg, state, rng)
        colluding_r1 = [o for o in r1 if o["attack"] == "collusion"]
        self.assertEqual(len(colluding_r1), 2)
        self.assertTrue(all(o["value"] == 3670.50 for o in colluding_r1))
        self.assertTrue(all(o["profile"] == "normal" for o in r1))

        first_targets = set(state["attacked_oracles"])
        r2 = inject_attacks(simulate_nodes_round(oracles, 3430.00, cfg, rng), 3430.00, cfg, state, rng)
        second_targets = {o["oracle_id"] for o in r2 if o["attack"] == "collusion"}
        self.assertEqual(first_targets, second_targets)

    def test_stale_repeats_reference_value(self) -> None:
        rng = np.random.default_rng(42)
        cfg = {"n_oracles": 3, "attack": "stale", "attacked_oracles": ["oracle_01"]}
        oracles = init_oracles(cfg, rng)
        state: dict = {}

        r1 = inject_attacks(simulate_nodes_round(oracles, 3420.50, cfg, rng), 3420.50, cfg, state, rng)
        frozen_val = next(o["value"] for o in r1 if o["oracle_id"] == "oracle_01")

        r2 = inject_attacks(simulate_nodes_round(oracles, 3500.00, cfg, rng), 3500.00, cfg, state, rng)
        o1_r2 = next(o for o in r2 if o["oracle_id"] == "oracle_01")
        self.assertEqual(o1_r2["attack"], "stale")
        self.assertEqual(o1_r2["value"], frozen_val)

    def test_spike_and_validations(self) -> None:
        rng = np.random.default_rng(42)
        cfg = {
            "n_oracles": 3,
            "attack": "spike",
            "attacked_oracles": ["oracle_02"],
            "spike_prob": 1.0,
            "spike_offset": 600.0,
        }
        oracles = init_oracles(cfg, rng)
        state: dict = {}

        res = inject_attacks(simulate_nodes_round(oracles, 3420.50, cfg, rng), 3420.50, cfg, state, rng)
        o2 = next(o for o in res if o["oracle_id"] == "oracle_02")
        self.assertEqual(o2["attack"], "spike")
        self.assertGreater(o2["value"], 3900.0)

        with self.assertRaises(ValueError):
            inject_attacks(res, 3420.50, {"attack": "spike", "spike_prob": 1.5}, {}, rng)

        with self.assertRaises(ValueError):
            inject_attacks(res, 3420.50, {"attack": "spike", "attacked_oracles": ["oracle_99"]}, {}, rng)


if __name__ == "__main__":
    unittest.main()
