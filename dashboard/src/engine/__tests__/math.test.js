import { describe, it, expect } from "vitest";
import {
  mean,
  median,
  trimmedMean,
  weightedMean,
  updateReputation,
  robustZScores,
  formatFormula,
} from "../math";

describe("Moteur Mathématique OracleBench-AI Live", () => {
  describe("mean", () => {
    it("calcule la moyenne exacte d'une série", () => {
      expect(mean([10, 20, 30])).toBe(20);
      expect(mean([100.2, 99.8])).toBe(100);
      expect(mean([])).toBe(0);
    });
  });

  describe("median", () => {
    it("calcule la médiane d'un nombre impair d'éléments", () => {
      expect(median([1, 5, 2, 8, 7])).toBe(5); // sorted: [1, 2, 5, 7, 8]
    });

    it("calcule la médiane d'un nombre pair d'éléments", () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it("gère une liste vide", () => {
      expect(median([])).toBe(0);
    });
  });

  describe("trimmedMean", () => {
    it("élimine les valeurs extrêmes avant de moyenner", () => {
      // 5 valeurs avec trimPct=0.2 (k=1) -> supprime 10 et 500 -> [98, 100, 102] -> moyenne 100
      const vals = [10, 98, 100, 102, 500];
      expect(trimmedMean(vals, 0.2)).toBe(100);
    });

    it("fonctionne sur de petites listes sans planter", () => {
      expect(trimmedMean([10, 20])).toBe(15);
    });
  });

  describe("weightedMean", () => {
    it("pondère correctement chaque élément", () => {
      const vals = [100, 200];
      const weights = [0.9, 0.1];
      // (100 * 0.9 + 200 * 0.1) / (0.9 + 0.1) = (90 + 20) / 1.0 = 110
      expect(weightedMean(vals, weights)).toBe(110);
    });
  });

  describe("updateReputation", () => {
    it("augmente la réputation jusqu'à la borne 1.0 lors d'un comportement normal", () => {
      expect(updateReputation(0.8, false)).toBe(0.85);
      expect(updateReputation(0.98, false)).toBe(1.0);
    });

    it("applique une pénalité et respecte la borne 0.0 lors d'une alerte", () => {
      expect(updateReputation(0.8, true)).toBe(0.55);
      expect(updateReputation(0.15, true)).toBe(0.0);
    });
  });

  describe("robustZScores", () => {
    it("détecte un spike isolé comme ALERT", () => {
      const vals = [100.1, 99.8, 100.2, 100.0, 99.9, 850.0];
      const scores = robustZScores(vals);
      expect(scores.length).toBe(6);
      expect(scores[5].status).toBe("ALERT");
      expect(scores[0].status).toBe("NORMAL");
    });
  });

  describe("formatFormula", () => {
    it("génère des formules cohérentes avec les calculs", () => {
      const values = [10, 20, 30];
      const fMean = formatFormula("mean", values, [], 20);
      expect(fMean).toContain("Mean = (10.0 + 20.0 + 30.0) / 3 = 20.00");

      const fMed = formatFormula("median", values, [], 20);
      expect(fMed).toContain("Median = 20.0 = 20.00");
    });
  });
});
