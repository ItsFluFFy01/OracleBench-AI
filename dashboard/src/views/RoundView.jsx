import React from "react";
import { Target, ShieldCheck, AlertTriangle, Users, Hash, Activity } from "lucide-react";
import { KpiCard }  from "../components/KpiCard";
import { StatChip } from "../components/StatChip";
import { LineCard }  from "../components/LineCard";
import { DonutCard } from "../components/DonutCard";

/** Construit la série temporelle réelle autour du round courant à partir de l'historique */
function buildTrendData(currentRound, allRounds = []) {
  if (Array.isArray(allRounds) && allRounds.length > 0) {
    const sorted = [...allRounds].sort((a, b) => a.round_id - b.round_id);
    const curId = currentRound.round_id;
    const curIdx = sorted.findIndex((r) => r.round_id === curId);
    const startIdx = Math.max(0, curIdx - 5);
    const slice = sorted.slice(startIdx, startIdx + 11);
    return slice.map((r) => ({
      name: `R${r.round_id}`,
      truth: r.ground_truth != null ? Number(r.ground_truth.toFixed(2)) : undefined,
      ai: r.final_value != null ? Number(r.final_value.toFixed(2)) : undefined,
    }));
  }
  const gt = currentRound.ground_truth ?? currentRound.final_value;
  return [{ name: `R${currentRound.round_id}`, truth: gt != null ? Number(gt.toFixed(2)) : undefined, ai: Number(currentRound.final_value.toFixed(2)) }];
}

/** Distribution des profils d'oracle ou statut réel */
function buildProfileData(oracles = []) {
  const counts = {};
  for (const o of oracles) {
    const p = o.profile || (o.status === "ALERT" ? "ALERT" : "NORMAL");
    counts[p] = (counts[p] || 0) + 1;
  }
  const colorMap = {
    NORMAL:    "var(--donut-normal, #10b981)",
    ALERT:     "var(--donut-alert, #ef4444)",
    BIASED:    "var(--donut-biased, #f59e0b)",
    SPIKE:     "var(--donut-spike, #ef4444)",
    STALE:     "var(--donut-stale, #64748b)",
    COLLUSION: "var(--donut-collusion, #8b5cf6)",
    NOISY:     "var(--donut-noisy, #3b82f6)",
  };
  return Object.entries(counts).map(([name, value]) => ({
    name: name === "NORMAL" ? "Sains (NORMAL)" : name === "ALERT" ? "Anomalies (ALERT)" : name,
    value,
    color: colorMap[name] || "var(--text-muted, #94a3b8)",
  }));
}

export function RoundView({ round, allRounds = [] }) {
  if (!round || !round.per_oracle) {
    return <div className="chart-card"><p className="chart-desc">Chargement des données du round...</p></div>;
  }

  const confidencePct = Math.round(round.confidence * 100);
  const isHighConf    = round.confidence >= 0.7;
  const alertCount    = round.per_oracle.filter((o) => o.status === "ALERT").length;
  const normalCount   = round.per_oracle.length - alertCount;
  const hasGT         = round.ground_truth != null;
  const errGT         = hasGT ? Math.abs(round.final_value - round.ground_truth).toFixed(3) : null;

  const trendData   = buildTrendData(round, allRounds);
  const profileData = buildProfileData(round.per_oracle);
  const breakdown   = round.breakdown || {};

  return (
    <div className="view-grid">
      {/* ── Ligne 1 : KPI + StatChips ── */}
      <div className="kpi-row">
        <KpiCard
          variant={1}
          label="Valeur Finale IA"
          value={round.final_value?.toFixed(2) ?? "—"}
          sub={hasGT ? `Vérité terrain : ${round.ground_truth?.toFixed(2)} (Err: ${errGT})` : "Pipeline Isolation Forest + Réputation"}
        />
        <KpiCard
          variant={2}
          label="Score de Confiance"
          value={`${confidencePct}%`}
          sub={isHighConf ? "Validé on-chain (≥ 70%)" : "Rejeté sous le seuil (< 70%)"}
          confidence={round.confidence}
        />
        <StatChip
          label="Oracles Actifs"
          value={round.per_oracle.length}
          icon={Users}
          badge={`${normalCount} sains`}
          badgeType="ok"
          sub={`Round #${round.round_id}`}
        />
        <StatChip
          label="Alertes Détectées"
          value={alertCount}
          icon={alertCount > 0 ? AlertTriangle : ShieldCheck}
          badge={alertCount > 0 ? `${alertCount} rejeté(s)` : "Aucune alerte"}
          badgeType={alertCount > 0 ? "err" : "ok"}
          sub="Isolation Forest"
        />
      </div>

      {/* ── Ligne 2 : Courbe réelle + Donut ── */}
      <div className="chart-row-2">
        <LineCard
          title="Tendance Temporelle Réelle (IA vs Vérité Terrain)"
          desc="Évolution factuelle des rounds issus du benchmark expérimental de la Partie B"
          data={trendData}
          lines={[
            ...(hasGT ? [{ key: "truth", label: "Vérité Terrain", color: "var(--line-truth, #3b82f6)" }] : []),
            { key: "ai", label: "Consensus IA", color: "var(--line-ai, #10b981)", dashed: false },
          ]}
        />
        <DonutCard
          title="Consensus & Qualité des Nœuds"
          data={profileData}
          centerLabel="oracles"
        />
      </div>

      {/* ── Ligne 3 : Décomposition Confiance & Preuve ── */}
      <div className="chart-row-2">
        {/* Décomposition de la formule de confiance */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">
              <Activity size={15} style={{ display: "inline", marginRight: 6 }} />
              Décomposition du Score de Confiance (Formule B)
            </h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "1rem", marginTop: "0.5rem" }}>
            <div className="stat-chip" style={{ padding: "0.75rem" }}>
              <span className="stat-chip-label">Accord Consensus</span>
              <strong className="mono" style={{ fontSize: "1.1rem", color: "var(--ok-text)" }}>
                {breakdown.agreement != null ? `${(breakdown.agreement * 100).toFixed(1)}%` : "—"}
              </strong>
            </div>
            <div className="stat-chip" style={{ padding: "0.75rem" }}>
              <span className="stat-chip-label">Couverture Oracles</span>
              <strong className="mono" style={{ fontSize: "1.1rem" }}>
                {breakdown.coverage != null ? `${(breakdown.coverage * 100).toFixed(0)}%` : `${normalCount}/${round.per_oracle.length}`}
              </strong>
            </div>
            <div className="stat-chip" style={{ padding: "0.75rem" }}>
              <span className="stat-chip-label">Atteinte Quorum</span>
              <strong className="mono" style={{ fontSize: "1.1rem", color: breakdown.quorum >= 1.0 ? "var(--ok-text)" : "var(--warn-text)" }}>
                {breakdown.quorum != null ? `${(breakdown.quorum * 100).toFixed(0)}%` : "100%"}
              </strong>
            </div>
            <div className="stat-chip" style={{ padding: "0.75rem" }}>
              <span className="stat-chip-label">Statut Blockchain</span>
              <strong className="mono" style={{ fontSize: "1rem", color: round.blockchain?.status === "CONFIRMED" || round.blockchain?.status === "VERIFIED" ? "var(--ok-text)" : "var(--warn-text)" }}>
                {round.blockchain?.status || (isHighConf ? "VALIDÉ" : "SKIPPED")}
              </strong>
            </div>
          </div>
        </div>

        {/* Hash de preuve */}
        <div className="chart-card hash-card">
          <div className="chart-header">
            <h3 className="chart-title">
              <Hash size={15} style={{ display: "inline", marginRight: 6 }} />
              Preuve Cryptographique On-Chain (Proof Hash)
            </h3>
          </div>
          <div className="hash-mono" style={{ wordBreak: "break-all", fontSize: "0.82rem" }}>
            {round.proof_hash}
          </div>
          <div className="chart-desc" style={{ marginTop: "0.6rem" }}>
            Empreinte SHA-256 déterministe scellant l'ensemble des observations. Vérifiable sur le Smart Contract Solidity.
          </div>
        </div>
      </div>
    </div>
  );
}
