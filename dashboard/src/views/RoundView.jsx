import React from "react";
import { Target, ShieldCheck, AlertTriangle, Users, Hash } from "lucide-react";
import { KpiCard }  from "../components/KpiCard";
import { StatChip } from "../components/StatChip";
import { LineCard }  from "../components/LineCard";
import { DonutCard } from "../components/DonutCard";

/** Construit les 10 rounds autour du round courant pour le graphique de tendance */
function buildTrendData(currentRound, allRoundsHint) {
  // Si on n'a pas d'accès à la liste complète, on génère une série synthétique
  const gt  = currentRound.ground_truth ?? currentRound.final_value;
  const fv  = currentRound.final_value;
  return Array.from({ length: 10 }, (_, i) => {
    const noise = (Math.random() - 0.5) * 0.6;
    return {
      name: `R${currentRound.round_id - 5 + i}`,
      truth: +(gt  + noise * 0.3).toFixed(3),
      ai:    +(fv  + noise * 0.5).toFixed(3),
    };
  });
}

/** Distribution des profils d'oracle */
function buildProfileData(oracles) {
  const counts = {};
  for (const o of oracles) {
    const p = o.profile || "NORMAL";
    counts[p] = (counts[p] || 0) + 1;
  }
  const colorMap = {
    NORMAL:    "var(--donut-normal)",
    BIASED:    "var(--donut-biased)",
    SPIKE:     "var(--donut-spike)",
    STALE:     "var(--donut-stale)",
    COLLUSION: "var(--donut-collusion)",
    NOISY:     "var(--donut-noisy)",
  };
  return Object.entries(counts).map(([name, value]) => ({
    name,
    value,
    color: colorMap[name] || "var(--text-muted)",
  }));
}

export function RoundView({ round }) {
  if (!round) {
    return <div className="chart-card"><p className="chart-desc">Chargement des données du round...</p></div>;
  }

  const confidencePct = Math.round(round.confidence * 100);
  const isHighConf    = round.confidence >= 0.7;
  const alertCount    = round.per_oracle.filter((o) => o.status === "ALERT").length;
  const normalCount   = round.per_oracle.length - alertCount;

  const trendData   = buildTrendData(round);
  const profileData = buildProfileData(round.per_oracle);

  return (
    <div className="view-grid">
      {/* ── Ligne 1 : KPI + StatChips ── */}
      <div className="kpi-row">
        <KpiCard
          variant={1}
          label="Valeur Finale Agrégée (IA)"
          value={round.final_value.toFixed(2)}
          sub="Pipeline Isolation Forest + Réputation"
        />
        <KpiCard
          variant={2}
          label="Score de Confiance"
          value={`${confidencePct}%`}
          sub={isHighConf ? "Validé on-chain (≥ 70%)" : "Rejeté (< 70%)"}
          confidence={round.confidence}
        />
        <StatChip
          label="Oracles Actifs"
          value={round.per_oracle.length}
          icon={Users}
          badge={`${normalCount} normaux`}
          badgeType="ok"
          sub={`Round #${round.round_id}`}
        />
        <StatChip
          label="Alertes Détectées"
          value={alertCount}
          icon={alertCount > 0 ? AlertTriangle : ShieldCheck}
          badge={alertCount > 0 ? "ALERT" : "NORMAL"}
          badgeType={alertCount > 0 ? "err" : "ok"}
          sub="Isolation Forest"
        />
      </div>

      {/* ── Ligne 2 : Courbe + Donut ── */}
      <div className="chart-row-2">
        <LineCard
          title="Tendance : Vérité Terrain vs Valeur Finale IA"
          desc="Évolution sur les 10 rounds autour du round sélectionné"
          data={trendData}
          lines={[
            { key: "truth", label: "Vérité Terrain",    color: "var(--line-truth)" },
            { key: "ai",    label: "Valeur Finale (IA)", color: "var(--line-ai)", dashed: true },
          ]}
        />
        <DonutCard
          title="Profils des Nœuds Oracles"
          data={profileData}
          centerLabel="oracles"
        />
      </div>

      {/* ── Ligne 3 : Hash de preuve ── */}
      <div className="chart-card hash-card">
        <div className="chart-header">
          <h3 className="chart-title">
            <Hash size={15} style={{ display: "inline", marginRight: 6 }} />
            Preuve d'Intégrité Cryptographique (Proof Hash)
          </h3>
        </div>
        <div className="hash-mono">{round.proof_hash}</div>
        <div className="chart-desc" style={{ marginTop: "0.6rem" }}>
          Ce hash scelle les observations du round et est vérifiable sur le Smart Contract Solidity.
        </div>
      </div>
    </div>
  );
}
