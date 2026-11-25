const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Générateur de fixtures de rounds et d'expériences
const rounds = [];
const oracleProfiles = ["NORMAL", "NOISY", "BIASED", "SPIKE", "STALE", "COLLUSION"];
const oracleIds = ["oracle_1", "oracle_2", "oracle_3", "oracle_4", "oracle_5", "oracle_6", "oracle_7", "oracle_8"];

// Réputations initiales
const reputations = {
  oracle_1: 0.98,
  oracle_2: 0.95,
  oracle_3: 0.91,
  oracle_4: 0.88,
  oracle_5: 0.75,
  oracle_6: 0.60,
  oracle_7: 0.45,
  oracle_8: 0.82,
};

let previousStaleValue = 100.0;

for (let r = 1; r <= 50; r++) {
  // Vérité terrain évoluant comme un actif financier avec tendance et oscillations
  const groundTruth = +(100 + Math.sin(r / 5) * 15 + Math.cos(r / 10) * 8).toFixed(2);

  // Nombre d'oracles actifs pour ce round (entre 6 et 8)
  const activeCount = 6 + (r % 3);
  const activeOracleIds = oracleIds.slice(0, activeCount);

  const perOracle = [];
  const reportedValues = [];

  for (let i = 0; i < activeOracleIds.length; i++) {
    const oId = activeOracleIds[i];
    let profile = "NORMAL";
    let reportedVal = groundTruth + (Math.random() - 0.5) * 0.8;
    let anomalyScore = +(0.05 + Math.random() * 0.15).toFixed(3);
    let status = "NORMAL";

    // Injection contrôlée d'anomalies selon le round et l'indice de l'oracle
    if (i === activeOracleIds.length - 1 && r % 4 === 0) {
      profile = "SPIKE";
      reportedVal = groundTruth + (Math.random() > 0.5 ? 25 : -25);
      anomalyScore = +(0.85 + Math.random() * 0.12).toFixed(3);
      status = "ALERT";
    } else if (i === activeOracleIds.length - 2 && r % 5 === 0) {
      profile = "BIASED";
      reportedVal = groundTruth + 6.5;
      anomalyScore = +(0.65 + Math.random() * 0.15).toFixed(3);
      status = "ALERT";
    } else if (i === activeOracleIds.length - 3 && r % 7 === 0) {
      profile = "NOISY";
      reportedVal = groundTruth + (Math.random() - 0.5) * 8.0;
      anomalyScore = +(0.45 + Math.random() * 0.2).toFixed(3);
      status = anomalyScore > 0.5 ? "ALERT" : "NORMAL";
    } else if (i === 3 && r % 9 === 0) {
      profile = "STALE";
      reportedVal = previousStaleValue;
      anomalyScore = +(0.72 + Math.random() * 0.15).toFixed(3);
      status = "ALERT";
    } else if (i >= activeOracleIds.length - 2 && r % 11 === 0) {
      profile = "COLLUSION";
      reportedVal = groundTruth + 12.0;
      anomalyScore = +(0.78 + Math.random() * 0.1).toFixed(3);
      status = "ALERT";
    }

    reportedVal = +reportedVal.toFixed(2);
    reportedValues.push(reportedVal);

    // Ajustement de réputation
    let rep = reputations[oId] || 0.8;
    if (status === "ALERT") {
      rep = Math.max(0.2, +(rep - 0.05).toFixed(2));
    } else {
      rep = Math.min(0.99, +(rep + 0.01).toFixed(2));
    }
    reputations[oId] = rep;

    perOracle.push({
      oracle_id: oId,
      value: reportedVal,
      anomaly_score: anomalyScore,
      reputation: rep,
      status: status,
    });
  }

  // Calcul des méthodes d'agrégation
  // 1. Moyenne
  const meanVal = +(reportedValues.reduce((a, b) => a + b, 0) / reportedValues.length).toFixed(2);

  // 2. Médiane
  const sortedVals = [...reportedValues].sort((a, b) => a - b);
  const mid = Math.floor(sortedVals.length / 2);
  const medianVal = +(sortedVals.length % 2 !== 0 ? sortedVals[mid] : (sortedVals[mid - 1] + sortedVals[mid]) / 2).toFixed(2);

  // 3. Trimmed mean (tronquer min et max)
  const trimmedArray = sortedVals.slice(1, -1);
  const trimmedVal = +(trimmedArray.reduce((a, b) => a + b, 0) / trimmedArray.length).toFixed(2);

  // 4. Pondérée par réputation
  let weightSum = 0;
  let weightedTotal = 0;
  perOracle.forEach((o) => {
    weightedTotal += o.value * o.reputation;
    weightSum += o.reputation;
  });
  const weightedVal = +(weightedTotal / weightSum).toFixed(2);

  // 5. Agrégation IA (filtrage des ALERT, puis moyenne pondérée)
  const normalOracles = perOracle.filter((o) => o.status === "NORMAL");
  let aiVal;
  if (normalOracles.length > 0) {
    let aiWeight = 0;
    let aiTotal = 0;
    normalOracles.forEach((o) => {
      aiTotal += o.value * o.reputation;
      aiWeight += o.reputation;
    });
    aiVal = +(aiTotal / aiWeight).toFixed(2);
  } else {
    aiVal = medianVal;
  }

  // Confiance calculée en fonction du ratio d'oracles normaux et du consensus
  const alertCount = perOracle.filter((o) => o.status === "ALERT").length;
  const normalRatio = (perOracle.length - alertCount) / perOracle.length;
  const variance = perOracle.reduce((acc, o) => acc + Math.pow(o.value - aiVal, 2), 0) / perOracle.length;
  const consensusFactor = Math.max(0.5, 1 - Math.min(1, Math.sqrt(variance) / 10));
  let confidence = +(normalRatio * 0.5 + consensusFactor * 0.5).toFixed(4);

  // Pour le round 13 et 27, créons un cas de confiance < 0.70 pour tester le rejet
  if (r === 13) confidence = 0.58;
  if (r === 27) confidence = 0.64;

  const proofHash = "0x" + crypto.createHash("sha256").update(`round-${r}-${aiVal}-${confidence}`).digest("hex");

  rounds.push({
    round_id: r,
    final_value: aiVal,
    confidence: confidence,
    proof_hash: proofHash,
    per_oracle: perOracle,
    methods: {
      mean: meanVal,
      median: medianVal,
      trimmed: trimmedVal,
      weighted: weightedVal,
      ai: aiVal,
    },
    ground_truth: groundTruth,
  });
}

// Fichier de synthèse des expériences mock
const experimentsSummary = {
  methods: {
    mean: { mae: 3.85, rmse: 5.62, latency_ms: 1.2 },
    median: { mae: 1.45, rmse: 2.10, latency_ms: 1.8 },
    trimmed: { mae: 1.20, rmse: 1.75, latency_ms: 2.1 },
    weighted: { mae: 0.98, rmse: 1.42, latency_ms: 2.5 },
    ai: { mae: 0.38, rmse: 0.55, latency_ms: 14.8 },
  },
  detection: {
    precision: 0.96,
    recall: 0.93,
    f1: 0.945,
    fpr: 0.025,
  },
  malicious_breakdown: [
    { malicious_pct: 0, mean_mae: 0.35, median_mae: 0.40, trimmed_mae: 0.38, weighted_mae: 0.34, ai_mae: 0.32 },
    { malicious_pct: 10, mean_mae: 1.85, median_mae: 0.65, trimmed_mae: 0.55, weighted_mae: 0.52, ai_mae: 0.34 },
    { malicious_pct: 20, mean_mae: 3.40, median_mae: 0.95, trimmed_mae: 0.85, weighted_mae: 0.72, ai_mae: 0.36 },
    { malicious_pct: 30, mean_mae: 5.20, median_mae: 1.45, trimmed_mae: 1.30, weighted_mae: 1.15, ai_mae: 0.39 },
    { malicious_pct: 40, mean_mae: 7.80, median_mae: 2.30, trimmed_mae: 2.10, weighted_mae: 1.85, ai_mae: 0.45 },
    { malicious_pct: 50, mean_mae: 11.5, median_mae: 4.80, trimmed_mae: 4.50, weighted_mae: 3.90, ai_mae: 0.72 },
  ],
};

const mocksDir = path.join(__dirname);
fs.writeFileSync(path.join(mocksDir, "rounds.json"), JSON.stringify(rounds, null, 2));
fs.writeFileSync(path.join(mocksDir, "experiments_summary.json"), JSON.stringify(experimentsSummary, null, 2));
console.log(`[Mocks] Généré 50 rounds dans rounds.json`);
console.log(`[Mocks] Généré experiments_summary.json`);
