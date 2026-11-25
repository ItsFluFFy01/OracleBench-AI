import React, { useState, useEffect } from "react";
import { StepCard } from "./StepCard";
import { ShieldCheck, AlertTriangle, Fuel, Clock } from "lucide-react";

export function CalculationPanel({ round, isPlaying }) {
  const [revealedStep, setRevealedStep] = useState(1);

  // Animation séquentielle d'environ 250 ms par étape
  useEffect(() => {
    if (!round) return;

    setRevealedStep(1);
    const timers = [];
    for (let s = 2; s <= 6; s++) {
      timers.push(
        setTimeout(() => {
          setRevealedStep((prev) => Math.max(prev, s));
        }, (s - 1) * 250)
      );
    }

    return () => timers.forEach(clearTimeout);
  }, [round?.round_id]);

  if (!round) {
    return (
      <div className="chart-card">
        <p className="chart-desc">Chargement des rounds depuis le backend...</p>
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
    breakdown = null,
    _isReal = false,
  } = round;

  const isAccepted = confidence >= 0.7;
  const bcStatus = blockchain?.status || (isAccepted ? "ACCEPTED" : "REJECTED");
  const isBcOk = ["ACCEPTED", "CONFIRMED", "VERIFIED"].includes(bcStatus);

  return (
    <div className="calculation-panel">
      {/* ── Étape 1 : Observations reçues ── */}
      <StepCard
        stepNumber={1}
        title={`Observations reçues par les Nœuds Oracles — Round #${round_id}`}
        subtitle={`Vérité terrain de référence : ${typeof ground_truth === "number" ? ground_truth.toFixed(3) : "Non fournie"}`}
        isActive={revealedStep === 1}
        isCompleted={revealedStep > 1}
      >
        <div className="oracle-pills-grid">
          {per_oracle.map((o) => {
            const pillClass = o.profile
              ? `pill-${o.profile.toLowerCase()}`
              : o.status === "ALERT"
                ? "pill-spike"
                : "pill-normal";
            return (
              <div key={o.oracle_id} className={`oracle-pill ${pillClass}`}>
                <div className="oracle-pill-id">{o.oracle_id}</div>
                <div className="oracle-pill-val">{typeof o.value === "number" ? o.value.toFixed(2) : o.value}</div>
                <div className="oracle-pill-profile">{o.profile || o.status || "OBS"}</div>
              </div>
            );
          })}
        </div>
      </StepCard>

      {/* ── Étape 2 : Détection d'anomalies ── */}
      {revealedStep >= 2 && (
        <StepCard
          stepNumber={2}
          title={_isReal ? "Détection d'anomalies (Isolation Forest — Backend B)" : "Détection d'anomalies (Score Robuste vs Seuil 0.65)"}
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
                    Score : <strong>{typeof o.anomaly_score === "number" ? o.anomaly_score.toFixed(3) : (o.anomaly_score ?? "non fourni")}</strong>
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
              const hasOld = typeof o.old_reputation === "number";
              const hasCur = typeof o.reputation === "number";
              const delta =
                typeof o.delta_reputation === "number"
                  ? o.delta_reputation
                  : hasOld && hasCur
                    ? +(o.reputation - o.old_reputation).toFixed(3)
                    : 0;
              const deltaClass = delta > 0 ? "rep-up" : delta < 0 ? "rep-down" : "rep-eq";
              return (
                <div key={o.oracle_id} className="reputation-cell">
                  <span className="mono">{o.oracle_id}</span>
                  <span className="rep-transition">
                    {hasOld ? `${(o.old_reputation * 100).toFixed(0)}%` : "—"}
                    {" → "}
                    <strong>{hasCur ? `${(o.reputation * 100).toFixed(0)}%` : "—"}</strong>
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
          subtitle="Comparaison des baselines statistiques et du consensus IA retenu"
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
              const rawVal = methods[key];
              const formattedVal = typeof rawVal === "number" ? rawVal.toFixed(4) : "non fourni";
              const formula = formulas[key] || `${label} = ${formattedVal}`;
              const err =
                typeof errors[key] === "number"
                  ? errors[key]
                  : typeof ground_truth === "number" && typeof rawVal === "number"
                    ? Math.abs(rawVal - ground_truth)
                    : null;
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
          subtitle={
            breakdown
              ? "Moyenne géométrique pondérée : Accord (30%) × Réputation (25%) × Couverture (20%) × Quorum (25%)"
              : "Accord des nœuds (40%) + Réputation moyenne (35%) + Rétention des sources (25%)"
          }
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
              <span className={`badge ${isBcOk ? "badge-normal" : "badge-alert"}`}>
                {bcStatus}
              </span>
            </div>

            <div className="bc-field">
              <span className="bc-field-label">Hash de Preuve :</span>
              <span className="mono hash-val">{proof_hash}</span>
            </div>

            <div className="bc-field">
              <span className="bc-field-label"><Fuel size={13} style={{ display: "inline", marginRight: 4 }} /> Gas estimé / mesuré :</span>
              <span className="mono">
                {blockchain?.gas_used
                  ? `${blockchain.gas_used.toLocaleString()} unités`
                  : isBcOk
                    ? "—"
                    : "0 (Rejeté)"}
              </span>
            </div>

            <div className="bc-field">
              <span className="bc-field-label"><Clock size={13} style={{ display: "inline", marginRight: 4 }} /> {blockchain?.tx_hash ? "Transaction :" : "Latence :"}</span>
              <span className="mono">
                {blockchain?.tx_hash
                  ? `${blockchain.tx_hash.slice(0, 18)}…`
                  : blockchain?.confirmation_ms
                    ? `${blockchain.confirmation_ms} ms`
                    : "—"}
              </span>
            </div>
          </div>

          <div className="blockchain-note">
            {blockchain?.note || (blockchain?.is_real ? "Données scellées par le backend Flask (Partie B)" : "Simulation navigateur")}
          </div>
        </StepCard>
      )}
    </div>
  );
}
