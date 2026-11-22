import React from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck, Target, Hash } from "lucide-react";

export function RoundView({ round }) {
  if (!round) {
    return <div className="card">Chargement des données du round...</div>;
  }

  const confidencePct = Math.round(round.confidence * 100);
  const isHighConfidence = round.confidence >= 0.7;
  const alertCount = round.per_oracle.filter((o) => o.status === "ALERT").length;
  const normalCount = round.per_oracle.length - alertCount;
  const hasGroundTruth = round.ground_truth !== undefined && round.ground_truth !== null;
  const errorVsGroundTruth = hasGroundTruth
    ? Math.abs(round.final_value - round.ground_truth).toFixed(3)
    : null;

  return (
    <div>
      {/* Grille des indicateurs clés */}
      <div className="cards-grid">
        {/* Valeur Finale */}
        <div className="card">
          <div className="card-title">
            <span>Valeur Finale Agrégée (IA)</span>
            <Target size={18} color="var(--accent-primary)" />
          </div>
          <div className="card-value">{round.final_value.toFixed(2)}</div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Méthode principale : Pipeline IA & Réputation
          </div>
        </div>

        {/* Score de Confiance */}
        <div className="card">
          <div className="card-title">
            <span>Score de Confiance</span>
            {isHighConfidence ? (
              <ShieldCheck size={18} color="var(--accent-success)" />
            ) : (
              <AlertTriangle size={18} color="var(--accent-danger)" />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <span className="card-value">{(round.confidence * 100).toFixed(1)}%</span>
            <span
              className={`badge ${isHighConfidence ? "badge-normal" : "badge-alert"}`}
            >
              {isHighConfidence ? "Valide (≥70%)" : "Rejeté (<70%)"}
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${confidencePct}%`,
                background: isHighConfidence ? "var(--accent-success)" : "var(--accent-danger)",
              }}
            />
          </div>
        </div>

        {/* Vérité Terrain (affichée seulement si présente = mode expérimental) */}
        {hasGroundTruth && (
          <div className="card">
            <div className="card-title">
              <span>Vérité Terrain (Benchmark)</span>
              <span className="badge badge-info">Mode Expérimental</span>
            </div>
            <div className="card-value">{round.ground_truth.toFixed(2)}</div>
            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Écart absolu : <strong style={{ color: "var(--text-main)" }}>{errorVsGroundTruth}</strong>
            </div>
          </div>
        )}

        {/* Statut Consensus Oracles */}
        <div className="card">
          <div className="card-title">
            <span>Consensus des Nœuds</span>
            <CheckCircle2 size={18} color="var(--accent-info)" />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--accent-success)" }} className="mono">
                {normalCount}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Normaux</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: alertCount > 0 ? "var(--accent-danger)" : "var(--text-muted)" }} className="mono">
                {alertCount}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Anomalies / Alertes</div>
            </div>
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Total : {round.per_oracle.length} nœuds oracles actifs
          </div>
        </div>
      </div>

      {/* Détails d'intégrité cryptographique */}
      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="card-title">
          <span>Preuve d'Intégrité Cryptographique (Proof Hash)</span>
          <Hash size={16} />
        </div>
        <div
          className="mono"
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            fontSize: "0.85rem",
            wordBreak: "break-all",
            border: "1px solid var(--border-subtle)",
            color: "var(--accent-info)",
          }}
        >
          {round.proof_hash}
        </div>
        <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Ce hash scelle les observations du round et est vérifiable sur le Smart Contract Solidity.
        </div>
      </div>
    </div>
  );
}
