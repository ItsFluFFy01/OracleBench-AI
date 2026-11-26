"""Tests unitaires pour oraclebench/aggregation.py."""

import unittest

from oraclebench.aggregation import (
    aggregate_all_baselines,
    aggregate_baseline,
    trimmed_mean,
)


class TestAggregation(unittest.TestCase):
    """Vérifie mean, median et trimmed mean."""

    def test_baselines_with_spike_outlier(self) -> None:
        values = [3420.1, 3419.8, 3421.2, 3420.5, 4020.5]
        res = aggregate_all_baselines(values, trim_ratio=0.2)
        self.assertEqual(res["mean"], 3540.42)
        self.assertEqual(res["median"], 3420.5)
        self.assertEqual(res["trimmed"], 3420.6)

    def test_trimmed_mean_small_list_fallback(self) -> None:
        self.assertEqual(trimmed_mean([3420.0, 3422.0], trim_ratio=0.2), 3421.0)
        self.assertEqual(trimmed_mean([3420.0], trim_ratio=0.2), 3420.0)

    def test_invalid_inputs(self) -> None:
        with self.assertRaises(ValueError):
            aggregate_baseline([], "mean")
        with self.assertRaises(ValueError):
            aggregate_baseline([3420.0, 3421.0], "unknown")
        with self.assertRaises(ValueError):
            trimmed_mean([3420.0, 3421.0], trim_ratio=0.5)


if __name__ == "__main__":
    unittest.main()
