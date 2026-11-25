/**
 * Fonctions mathématiques pures et moteur de calcul pour OracleBench-AI Live
 */

// 1. Moyenne arithmétique simple
export function mean(values) {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

// 2. Médiane simple
export function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// 3. Moyenne tronquée (trimmed mean à trimPct, par défaut 20%)
export function trimmedMean(values, trimPct = 0.2) {
  if (!values || values.length === 0) return 0;
  if (values.length <= 2) return mean(values);
  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.floor(sorted.length * trimPct);
  // Élimine au moins 1 élément de chaque côté si k=0 et length >= 4
  const trimCount = k > 0 ? k : (sorted.length >= 4 ? 1 : 0);
  const remaining = sorted.slice(trimCount, sorted.length - trimCount);
  return mean(remaining);
}

// 4. Moyenne pondérée (par réputation)
export function weightedMean(values, weights) {
  if (!values || values.length === 0) return 0;
  let weightSum = 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights && weights[i] != null ? Math.max(0.001, weights[i]) : 1.0;
    sum += values[i] * w;
    weightSum += w;
  }
  return weightSum > 0 ? sum / weightSum : mean(values);
}

// 5. Score d'anomalie robuste (Médiane et MAD - Ecart absolu médian)
export function robustZScores(values) {
  if (!values || values.length === 0) return [];
  const med = median(values);
  const absDevs = values.map((v) => Math.abs(v - med));
  const mad = median(absDevs);
  // Constante de consistance normale 1.4826, epsilon pour éviter division par zéro
  const scale = mad > 1e-6 ? mad * 1.4826 : 1.0;

  return values.map((v) => {
    const z = Math.abs(v - med) / scale;
    // Normalisé en score de probabilité [0, 1] via fonction sigmoïde/arctan
    const score = +(Math.atan(z / 2) / (Math.PI / 2)).toFixed(3);
    return {
      zScore: +(z).toFixed(2),
      anomalyScore: score,
      status: z >= 2.5 || score >= 0.65 ? "ALERT" : "NORMAL",
    };
  });
}

// 6. Règle d'évolution de réputation bornée [0, 1]
export function updateReputation(currentRep, isAnomaly) {
  const rep = typeof currentRep === "number" ? currentRep : 0.8;
  if (isAnomaly) {
    // Pénalité sévère en cas d'anomalie
    return Math.max(0.0, +(rep - 0.25).toFixed(3));
  }
  // Récompense modérée avec récupération progressive (borne 1.0)
  return Math.min(1.0, +(rep + 0.05).toFixed(3));
}

// 7. Générateur de vérité terrain (sinusoïde + tendance + bruit)
export function generateGroundTruth(roundId, prng) {
  const base = 100.0;
  const trend = roundId * 0.08;
  const cycle = Math.sin(roundId * 0.15) * 8.0;
  const noise = prng.normal(0, 0.4);
  return +(base + trend + cycle + noise).toFixed(2);
}

// 8. Générateur d'observations d'oracles avec attaques configurables
export function generateOracleObservations(groundTruth, count, maliciousPct, attackType, prng, previousValues = {}) {
  const numMalicious = Math.round((count * maliciousPct) / 100);
  const maliciousIndices = new Set();

  while (maliciousIndices.size < numMalicious) {
    maliciousIndices.add(Math.floor(prng.uniform(0, count)));
  }

  const observations = [];
  const collusionShift = prng.uniform(15, 30); // Décalage coordonné pour collusion

  for (let i = 0; i < count; i++) {
    const oracleId = `oracle_${String(i + 1).padStart(2, "0")}`;
    const isMalicious = maliciousIndices.has(i);
    let value = groundTruth;
    let profile = "NORMAL";

    if (!isMalicious) {
      value = groundTruth + prng.normal(0, 0.35);
      profile = "NORMAL";
    } else {
      switch (attackType) {
        case "spike":
          profile = "SPIKE";
          value = groundTruth + prng.uniform(50, 150) * (prng.next() > 0.5 ? 1 : -1);
          break;
        case "stale":
          profile = "STALE";
          value = previousValues[oracleId] != null ? previousValues[oracleId] : groundTruth - 12.5;
          break;
        case "collusion":
          profile = "COLLUSION";
          value = groundTruth + collusionShift + prng.normal(0, 0.1);
          break;
        case "bias":
        default:
          profile = "BIASED";
          value = groundTruth + (i % 2 === 0 ? 18.0 : -18.0) + prng.normal(0, 0.4);
          break;
      }
    }

    observations.push({
      oracle_id: oracleId,
      profile,
      value: +(value).toFixed(2),
    });
  }

  return observations;
}

// 9. Calcul du score de confiance documenté
export function computeConfidence(oracles, finalValue, retainedCount) {
  if (!oracles || oracles.length === 0) return 0;
  
  // Facteur 1 : Ratio d'oracles sains retenus
  const retentionRatio = retainedCount / oracles.length;

  // Facteur 2 : Réputation moyenne des oracles retenus
  const avgRep = mean(oracles.map((o) => o.reputation ?? 0.8));

  // Facteur 3 : Dispersion des oracles sains autour de la valeur finale
  const deviations = oracles
    .filter((o) => o.status !== "ALERT")
    .map((o) => Math.abs(o.value - finalValue));
  const avgDev = deviations.length > 0 ? mean(deviations) : 5.0;
  const agreementFactor = Math.max(0.1, 1.0 - Math.min(1.0, avgDev / 4.0));

  // Formule globale pondérée : 40% accord + 35% réputation + 25% rétention
  const confidence = 0.4 * agreementFactor + 0.35 * avgRep + 0.25 * retentionRatio;
  return +Math.min(0.99, Math.max(0.1, confidence)).toFixed(4);
}

// 10. Formatage exact des formules avec nombres substitués pour affichage
export function formatFormula(methodKey, values, weights = [], result = 0) {
  if (!values || values.length === 0) return "";
  const n = values.length;

  switch (methodKey) {
    case "mean": {
      const parts = values.map((v) => v.toFixed(1));
      const strSum = parts.length <= 5 ? parts.join(" + ") : `${parts.slice(0, 3).join(" + ")} + … + ${parts[parts.length - 1]}`;
      return `Mean = (${strSum}) / ${n} = ${result.toFixed(2)}`;
    }
    case "median": {
      const sorted = [...values].sort((a, b) => a - b).map((v) => v.toFixed(1));
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return `Median = (${sorted[mid - 1]} + ${sorted[mid]}) / 2 = ${result.toFixed(2)}`;
      }
      return `Median = ${sorted[mid]} = ${result.toFixed(2)}`;
    }
    case "trimmed": {
      const sorted = [...values].sort((a, b) => a - b);
      const k = Math.floor(sorted.length * 0.2) || (sorted.length >= 4 ? 1 : 0);
      const remaining = sorted.slice(k, sorted.length - k).map((v) => v.toFixed(1));
      return `Trimmed (20%) = (${remaining.join(" + ")}) / ${remaining.length} = ${result.toFixed(2)}`;
    }
    case "weighted": {
      const terms = values.slice(0, 4).map((v, i) => `(${v.toFixed(1)} × ${(weights[i] ?? 1).toFixed(2)})`);
      return `Weighted = (${terms.join(" + ")}${values.length > 4 ? " + …" : ""}) / Σw = ${result.toFixed(2)}`;
    }
    case "ai": {
      return `AI = Σ(Normal_i × Rep_i) / ΣRep_Normal = ${result.toFixed(2)}`;
    }
    default:
      return `${methodKey} = ${result.toFixed(2)}`;
  }
}
