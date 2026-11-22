import { createPRNG } from "./prng";
import {
  mean,
  median,
  trimmedMean,
  weightedMean,
  robustZScores,
  updateReputation,
  generateGroundTruth,
  generateOracleObservations,
  computeConfidence,
  formatFormula,
} from "./math";

/**
 * Moteur d'état pour la simulation Live
 */
export class LiveSimulationEngine {
  constructor(options = {}) {
    this.seed = options.seed || 42;
    this.oracleCount = options.oracleCount || 10;
    this.maliciousPct = options.maliciousPct || 20;
    this.attackType = options.attackType || "spike";
    this.roundId = 0;
    this.prng = createPRNG(this.seed);

    // Dictionnaire des réputations courantes par oracle
    this.reputations = {};
    this.previousValues = {};
    this.initOracles();
  }

  initOracles() {
    this.reputations = {};
    for (let i = 0; i < this.oracleCount; i++) {
      const id = `oracle_${String(i + 1).padStart(2, "0")}`;
      // Initialisé à 0.80 pour tous
      this.reputations[id] = 0.8;
    }
  }

  configure(options = {}) {
    if (options.seed !== undefined && options.seed !== this.seed) {
      this.seed = options.seed;
      this.prng = createPRNG(this.seed);
      this.roundId = 0;
      this.initOracles();
    }
    if (options.oracleCount !== undefined && options.oracleCount !== this.oracleCount) {
      this.oracleCount = options.oracleCount;
      this.initOracles();
    }
    if (options.maliciousPct !== undefined) this.maliciousPct = options.maliciousPct;
    if (options.attackType !== undefined) this.attackType = options.attackType;
  }

  // Calcule un round de simulation complet
  computeNextRound() {
    this.roundId += 1;
    const roundId = this.roundId;

    // 1. Vérité terrain
    const groundTruth = generateGroundTruth(roundId, this.prng);

    // 2. Observations brutes
    const rawObs = generateOracleObservations(
      groundTruth,
      this.oracleCount,
      this.maliciousPct,
      this.attackType,
      this.prng,
      this.previousValues
    );

    const values = rawObs.map((o) => o.value);

    // 3. Détection d'anomalies (Robuste MAD)
    const detections = robustZScores(values);

    // 4. Mise à jour de la réputation
    const perOracle = rawObs.map((obs, idx) => {
      const det = detections[idx];
      const oldRep = this.reputations[obs.oracle_id] ?? 0.8;
      const isAnomaly = det.status === "ALERT";
      const newRep = updateReputation(oldRep, isAnomaly);
      this.reputations[obs.oracle_id] = newRep;
      this.previousValues[obs.oracle_id] = obs.value;

      return {
        oracle_id: obs.oracle_id,
        value: obs.value,
        profile: obs.profile,
        anomaly_score: det.anomalyScore,
        z_score: det.zScore,
        status: det.status,
        old_reputation: oldRep,
        reputation: newRep,
        delta_reputation: +(newRep - oldRep).toFixed(3),
      };
    });

    // 5. Calcul des différentes méthodes d'agrégation
    const weights = perOracle.map((o) => o.reputation);
    const meanVal = +(mean(values)).toFixed(2);
    const medianVal = +(median(values)).toFixed(2);
    const trimmedVal = +(trimmedMean(values, 0.2)).toFixed(2);
    const weightedVal = +(weightedMean(values, weights)).toFixed(2);

    // AI : filtrage des ALERT + moyenne pondérée par réputation
    const normalOracles = perOracle.filter((o) => o.status !== "ALERT");
    const aiVal = normalOracles.length > 0
      ? +(weightedMean(normalOracles.map((o) => o.value), normalOracles.map((o) => o.reputation))).toFixed(2)
      : medianVal;

    const methods = {
      mean: meanVal,
      median: medianVal,
      trimmed: trimmedVal,
      weighted: weightedVal,
      ai: aiVal,
    };

    // Erreurs absolues vs Ground Truth
    const errors = {
      mean: +(Math.abs(meanVal - groundTruth)).toFixed(3),
      median: +(Math.abs(medianVal - groundTruth)).toFixed(3),
      trimmed: +(Math.abs(trimmedVal - groundTruth)).toFixed(3),
      weighted: +(Math.abs(weightedVal - groundTruth)).toFixed(3),
      ai: +(Math.abs(aiVal - groundTruth)).toFixed(3),
    };

    // Formules substituées avec les vraies valeurs
    const formulas = {
      mean: formatFormula("mean", values, weights, meanVal),
      median: formatFormula("median", values, weights, medianVal),
      trimmed: formatFormula("trimmed", values, weights, trimmedVal),
      weighted: formatFormula("weighted", values, weights, weightedVal),
      ai: formatFormula("ai", normalOracles.map((o) => o.value), normalOracles.map((o) => o.reputation), aiVal),
    };

    // 6. Confiance et hash
    const confidence = computeConfidence(perOracle, aiVal, normalOracles.length);
    const isAccepted = confidence >= 0.7;

    const confidenceFormula = `Confidence = 0.40 × Accord (${(1 - Math.min(1, errors.ai / 4)).toFixed(2)}) + 0.35 × RépMoy (${mean(weights).toFixed(2)}) + 0.25 × Rétention (${normalOracles.length}/${this.oracleCount}) = ${(confidence * 100).toFixed(1)}%`;

    // Hash pseudo-cryptographique représentatif
    const proofHash = `0x${Math.abs(Math.sin(roundId * 9999 + aiVal)).toString(16).substring(2, 10)}${Math.abs(Math.cos(confidence * 1234)).toString(16).substring(2, 10)}...${roundId}`;

    return {
      round_id: roundId,
      ground_truth: groundTruth,
      final_value: aiVal,
      confidence,
      confidence_formula: confidenceFormula,
      proof_hash: proofHash,
      per_oracle: perOracle,
      methods,
      formulas,
      errors,
      blockchain: {
        status: isAccepted ? "ACCEPTED" : "REJECTED",
        threshold: 0.7,
        gas_used: isAccepted ? 145000 + (roundId % 5) * 250 : 0,
        confirmation_ms: isAccepted ? 2.5 + (roundId % 4) * 0.5 : 0,
        is_real: false,
        note: "Simulation locale (pont non appelé en boucle)",
      },
    };
  }
}
