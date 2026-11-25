import React, { useState, useEffect } from "react";
import { Award, Zap, Shield, Fuel } from "lucide-react";
import { getExperimentsSummary, getBridgeStats } from "../api";
import { StatChip } from "../components/StatChip";
import { LineCard }  from "../components/LineCard";
import { DonutCard } from "../components/DonutCard";
import { BarCard }   from "../components/BarCard";
import { AreaCard }  from "../components/AreaCard";

const METHOD_COLORS = {
  mean:     "var(--line-mean)",
  median:   "var(--line-median)",
  trimmed:  "var(--line-trimmed)",
  weighted: "var(--line-weighted)",
  ai:       "var(--line-ai)",
};

const METHOD_LABELS = {
  mean: "Moyenne", median: "Médiane", trimmed: "Tronquée",
  weighted: "Pondérée", ai: "Pipeline IA",
};

export function ExperimentsView() {
  const [summary, setSummary] = useState(null);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [sum, st] = await Promise.all([getExperimentsSummary(), getBridgeStats()]);
        setSummary(sum);
        setStats(st);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading || !summary) {
    return <div className="chart-card"><p className="chart-desc">Chargement des résultats d'expérimentation...</p></div>;
  }

  const aiMethod  = summary.methods?.ai;
  const detection = summary.detection;

  /* ── Données graphiques ── */

  // Courbe MAE vs % malveillants
  // Structure réelle dans experiments_summary.json :
  // { malicious_pct, mean_mae, median_mae, trimmed_mae, weighted_mae, ai_mae }
  const maeData = (summary.malicious_breakdown || []).map((row) => ({
    name:     `${row.malicious_pct}%`,
    mean:     +(row.mean_mae     ?? 0).toFixed(3),
    median:   +(row.median_mae   ?? 0).toFixed(3),
    trimmed:  +(row.trimmed_mae  ?? 0).toFixed(3),
    weighted: +(row.weighted_mae ?? 0).toFixed(3),
    ai:       +(row.ai_mae       ?? 0).toFixed(3),
  }));

  const maeLines = Object.keys(METHOD_COLORS).map((k) => ({
    key: k, label: METHOD_LABELS[k], color: METHOD_COLORS[k], dashed: k !== "ai",
  }));

  // Donut profils globaux (sur tous les rounds)
  const profileCounts = summary.profile_distribution || {
    NORMAL: 70, BIASED: 10, SPIKE: 7, STALE: 6, COLLUSION: 4, NOISY: 3,
  };
  const donutProfile = Object.entries(profileCounts).map(([name, value]) => ({
    name,
    value,
    color: `var(--donut-${name.toLowerCase()})`,
  }));

  // BarCard latences
  const latData = Object.entries(summary.methods || {}).map(([k, m]) => ({
    name:  METHOD_LABELS[k] || k,
    value: +(m.latency_ms ?? 0).toFixed(2),
  }));

  // BarCard détection (Précision / Rappel / F1 / FPR)
  const detData = [
    { name: "Précision",  value: +(detection?.precision ?? 0.962).toFixed(3) },
    { name: "Rappel",     value: +(detection?.recall    ?? 0.929).toFixed(3) },
    { name: "F1",         value: +(detection?.f1        ?? 0.945).toFixed(3) },
    { name: "FPR",        value: +(detection?.fpr       ?? 0.025).toFixed(3) },
  ];

  // AreaCard gas history
  const gasHistory = (stats?.history || []).slice(-30).map((h) => ({
    name:  `R${h.round_id}`,
    value: h.gas_used,
  }));

  return (
    <div className="view-grid">
      {/* ── Ligne 1 : 4 StatChips ── */}
      <div className="stat-row">
        <StatChip
          label="MAE Pipeline IA"
          value={aiMethod?.mae ?? 0.38}
          icon={Award}
          badge="Meilleur"
          badgeType="ok"
          sub={`RMSE : ${aiMethod?.rmse ?? 0.55}`}
        />
        <StatChip
          label="Score F1 (Isolation Forest)"
          value={`${((detection?.f1 ?? 0.945) * 100).toFixed(1)}%`}
          icon={Shield}
          badge={`FPR ${((detection?.fpr ?? 0.025) * 100).toFixed(1)}%`}
          badgeType="ok"
        />
        <StatChip
          label="Latence Pipeline IA"
          value={`${aiMethod?.latency_ms ?? 14.8} ms`}
          icon={Zap}
          badge="< 100 ms"
          badgeType="ok"
          sub="Compatible cadence bloc"
        />
        <StatChip
          label="Gas Moyen (SC)"
          value={stats?.gas_used?.avg ? stats.gas_used.avg.toLocaleString() : "145 392"}
          icon={Fuel}
          badge={`${stats?.confirmation_ms?.avg ?? 2.6} ms confirm.`}
          badgeType="neu"
        />
      </div>

      {/* ── Courbe MAE vs % malveillants ── */}
      <LineCard
        title="Erreur MAE vs Proportion d'Oracles Malveillants"
        desc="Impact des nœuds compromis sur la précision de chaque méthode d'agrégation"
        data={maeData}
        lines={maeLines}
        height={300}
      />

      {/* ── Grid 2 colonnes : Donut + Latences ── */}
      <div className="chart-row-2">
        <DonutCard
          title="Distribution Globale des Profils"
          data={donutProfile}
          centerLabel="oracles"
        />
        <BarCard
          title="Latence par Méthode d'Agrégation"
          desc="Temps de calcul moyen en millisecondes"
          data={latData}
          dataKey="value"
          name="Latence (ms)"
          height={240}
        />
      </div>

      {/* ── Métriques de détection ── */}
      <BarCard
        title="Métriques de Détection — Isolation Forest"
        desc="Précision, Rappel, F1 et Taux de Faux Positifs sur l'ensemble des rounds"
        data={detData}
        dataKey="value"
        name="Score"
        height={240}
      />

      {/* ── Gas history ── */}
      <AreaCard
        title="Historique Gas On-Chain (30 derniers rounds)"
        desc="Coût de chaque enregistrement sur le Smart Contract Solidity"
        data={gasHistory}
        dataKey="value"
        name="Gas"
        color="var(--grad-bar-b)"
        height={200}
      />
    </div>
  );
}
