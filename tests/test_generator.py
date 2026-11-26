"""Tests unitaires pour oraclebench/generator.py."""

import unittest

from oraclebench.generator import generate_ground_truth


class TestGenerator(unittest.TestCase):
    """Vérifie la génération et la reproductibilité de la vérité terrain ETH/USD."""

    def test_default_length_and_range(self) -> None:
        series = generate_ground_truth({}, seed=42)
        self.assertEqual(len(series), 100)
        self.assertTrue(all(isinstance(v, float) for v in series))
        self.assertTrue(all(3000.0 < v < 4000.0 for v in series))

    def test_reproducibility(self) -> None:
        cfg = {"rounds": 10, "base_value": 3420.50}
        s1 = generate_ground_truth(cfg, seed=42)
        s2 = generate_ground_truth(cfg, seed=42)
        s3 = generate_ground_truth(cfg, seed=99)
        self.assertEqual(s1, s2)
        self.assertNotEqual(s1, s3)

    def test_linear_trend_without_noise(self) -> None:
        cfg = {
            "rounds": 4,
            "base_value": 3420.50,
            "amplitude": 0.0,
            "trend": 1.5,
            "noise_std": 0.0,
        }
        series = generate_ground_truth(cfg, seed=1)
        self.assertEqual(series, [3420.5, 3422.0, 3423.5, 3425.0])

    def test_invalid_parameters(self) -> None:
        with self.assertRaises(ValueError):
            generate_ground_truth({"rounds": 0}, seed=42)
        with self.assertRaises(ValueError):
            generate_ground_truth({"period": 0}, seed=42)


if __name__ == "__main__":
    unittest.main()
