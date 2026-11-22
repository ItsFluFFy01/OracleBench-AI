import React, { useState, useEffect } from "react";
import { StepCard } from "./StepCard";
import { ShieldCheck, AlertTriangle, Blocks, Hash, Fuel, Clock } from "lucide-react";

export function CalculationPanel({ round, isPlaying }) {
  const [revealedStep, setRevealedStep] = useState(1);

  // Animation séquentielle d'environ 300 ms par étape
  useEffect(() => {
    if (!round) return;

    // Déroulement séquentiel des étapes 1 à 6
    setRevealedStep(1);
    const timers = [];
    for (let s = 2; s <= 6; s++) {
      timers.push(
        setTimeout(() => {
          setRevealedStep((prev) => Math.max(prev, s));
        }, (s - 1) * 300)
      );
    }

    return () => timers.forEach(clearTimeout);
  }, [round?.round_id]);

  if (!round) {
    return (
      <div className="chart-card">
        <p className="chart-desc">En attente du premier round...</p>
      </div>
    );
  }

  const {
    round_id,
    ground_truth,
    per_oracle = [],
    methods = {},
    formulas = {},
    errors = {},
    confidence = 0,
    confidence_formula = "",
    proof_hash = "—",
    blockchain = {},
  } = round;

  const isAccepted = confidence >= 0.7;

  return (
    <div className="calculation-panel">
      {/* ── Étape 1 : Observations reçues ── */}
      <StepCard
        stepNumber={1}
        title="Observations reçues par les Nœuds Oracles"
        subtitle={`Vérité terrain de référence : ${ground_truth ?? "Non fournie"}`}
        isActive={revealedStep === 1}
        isCompleted={revealedStep > 1}
      >
        <div className="oracle-pills-grid">
          {per_oracle.map((o) => (
            <div key={o.oracle_id} className={`oracle-pill pill-${(o.profile || "normal").toLowerCase()}`}>
              <div className="oracle-pill-id">{o.oracle_id}</div>
              <div className="oracle-pill-val">{typeof o.value === "number" ? o.value.toFixed(2) : o.value}</div>
              <div className="oracle-pill-profile">{o.profile || "OBS"}</div>
            </div>
          ))}
        </div>
      </StepCard>

      {/* ── Étape 2 : Détection d'anomalies ── */}
      {revealedStep >= 2 && (
        <StepCard
          stepNumber={2}
          title="Détection d'anomalies (Score Robuste vs Seuil 0.65)"
          subtitle="Isolation des observations aberrantes ou malveillantes"
          isActive={revealedStep === 2}
          isCompleted={revealedStep > 2}
        >
          <div className="oracle-detection-grid">
            {per_oracle.map((o) => {
              const isAlert = o.status === "ALERT";
              return (
                <div key={o.oracle_id} className={`detection-card ${isAlert ? "alert" : "normal"}`}>
                  <div className="detection-header">
                    <span className="mono">{o.oracle_id}</span>
                    <span className={`badge ${isAlert ? "badge-alert" : "badge-normal"}`}>
                      {isAlert ? <AlertTriangle size={11} /> : <ShieldCheck size={11} />}
                      {o.status || "NORMAL"}
                    </span>
                  </div>
                  <div className="detection-score">
                    Score : <strong>{typeof o.anomaly_score === "number" ? o.anomaly_score.toFixed(3) : (o.anomaly_score || "non fourni")}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </StepCard>
      )}

      {/* ── Étape 3 : Mise à jour de réputation ── */}
      {revealedStep >= 3 && (
        <StepCard
          stepNumber={3}
          title="Mise à jour de Réputation (Récompense / Pénalité / Récupération)"
          subtitle="Règle bornée entre 0 et 1 selon le comportement sur ce round"
          isActive={revealedStep === 3}
          isCompleted={revealedStep > 3}
        >
          <div className="reputation-flow-grid">
            {per_oracle.map((o) => {
              const delta = o.delta_reputation ?? (o.reputation && o.old_reputation ? +(o.reputation - o.old_reputation).toFixed(3) : 0);
              const deltaClass = delta > 0 ? "rep-up" : delta < 0 ? "rep-down" : "rep-eq";
              return (
                <div key={o.oracle_id} className="reputation-cell">
                  <span className="mono">{o.oracle_id}</span>
                  <span className="rep-transition">
                    {typeof o.old_reputation === "number" ? `${(o.old_reputation * 100).toFixed(0)}%` : "80%"}
                    {" → "}
                    <strong>{typeof o.reputation === "number" ? `${(o.reputation * 100).toFixed(0)}%` : "—"}</strong>
                  </span>
                  <span className={`rep-delta ${deltaClass}`}>
                    {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "="}
                  </span>
                </div>
              );
            })}
          </div>
        </StepCard>
      )}

      {/* ── Étape 4 : Agrégation multi-méthodes ── */}
      {revealedStep >= 4 && (
        <StepCard
          stepNumber={4}
          title="Calculs d'Agrégation Multi-Stratégies"
          subtitle="Formules explicites avec substitution des valeurs réelles"
          isActive={revealedStep === 4}
          isCompleted={revealedStep > 4}
        >
          <div className="formulas-list">
            {[
              { key: "mean", label: "Moyenne Simple" },
              { key: "median", label: "Médiane Simple" },
              { key: "trimmed", label: "Moyenne Tronquée (20%)" },
              { key: "weighted", label: "Moyenne Pondérée (Réputation)" },
              { key: "ai", label: "Pipeline IA (OracleBench Retenu)" },
            ].map(({ key, label }) => {
              const formula = formulas[key] || `${label} = ${methods[key] ?? "non fourni"}`;
              const err = errors[key];
              const isAI = key === "ai";
              return (
                <div key={key} className={`formula-box ${isAI ? "formula-ai" : ""}`}>
                  <div className="formula-header">
                    <span className="formula-method-name">{label}</span>
                    {err != null && (
                      <span className="formula-error-badge">
                        Écart vs Vérité : <strong>{err.toFixed(3)}</strong>
                      </span>
                    )}
                  </div>
                  <div className="formula-body mono">{formula}</div>
                </div>
              );
            })}
          </div>
        </StepCard>
      )}

      {/* ── Étape 5 : Score de confiance ── */}
      {revealedStep >= 5 && (
        <StepCard
          stepNumber={5}
          title="Calcul du Score de Confiance"
          subtitle="Accord des nœuds (40%) + Réputation moyenne (35%) + Rétention des sources (25%)"
          isActive={revealedStep === 5}
          isCompleted={revealedStep > 5}
        >
          <div className="confidence-calc-box">
            <div className="confidence-value-big">
              {(confidence * 100).toFixed(1)}%
              <span className={`badge ${isAccepted ? "badge-normal" : "badge-alert"}`} style={{ marginLeft: 10 }}>
                {isAccepted ? "Validé (≥ 70%)" : "Rejeté (< 70%)"}
              </span>
            </div>
            <div className="confidence-formula-str mono">
              {confidence_formula || `Score de confiance : ${(confidence * 100).toFixed(1)}%`}
            </div>
          </div>
        </StepCard>
      )}

      {/* ── Étape 6 : Scellement & Blockchain ── */}
      {revealedStep >= 6 && (
        <StepCard
          stepNumber={6}
          title="Scellement Cryptographique & Smart Contract"
          subtitle="Validation finale du consensus on-chain"
          isActive={revealedStep === 6}
          isCompleted={true}
        >
          <div className="blockchain-step-grid">
            <div className="bc-field">
              <span className="bc-field-label">Statut On-Chain :</span>
              <span className={`badge ${blockchain?.status === "ACCEPTED" ? "badge-normal" : "badge-alert"}`}>
                {blockchain?.status || (isAccepted ? "ACCEPTED" : "REJECTED")}
              </span>
            </div>

            <div className="bc-field">
              <span className="bc-field-label">Hash de Preuve :</span>
              <span className="mono hash-val">{proof_hash}</span>
            </div>

            <div className="bc-field">
              <span className="bc-field-label"><Fuel size={13} style={{ display: "inline", marginRight: 4 }} /> Gas estimé :</span>
              <span className="mono">{blockchain?.gas_used ? `${blockchain.gas_used.toLocaleString()} unités` : "0 (Rejeté)"}</span>
            </div>

            <div className="bc-field">
              <span className="bc-field-label"><Clock size={13} style={{ display: "inline", marginRight: 4 }} /> Latence :</span>
              <span className="mono">{blockchain?.confirmation_ms ? `${blockchain.confirmation_ms} ms` : "—"}</span>
            </div>
          </div>

          <div className="blockchain-note">
            {blockchain?.note || (blockchain?.is_real ? "Enregistré on-chain via le pont HTTP" : "Simulation navigateur")}
          </div>
        </StepCard>
      )}
    </div>
  );
}
