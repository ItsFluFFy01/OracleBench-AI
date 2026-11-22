import React from "react";
import { GitCompare, Award, Check } from "lucide-react";
import { BarCard }  from "../components/BarCard";
import { LineCard } from "../components/LineCard";

const METHODS_LIST = [
  { key: "mean",     label: "Moyenne",         desc: "Sensible aux spikes" },
  { key: "median",   label: "Médiane",          desc: "Robuste aux spikes isolés" },
  { key: "trimmed",  label: "Tronquée",         desc: "Élimine min et max" },
  { key: "weighted", label: "Pondérée",         desc: "Pondération par réputation" },
  { key: "ai",       label: "Pipeline IA",      desc: "Isolation Forest + Réputation" },
];

/** Génère une mini-série de 8 points simulée autour des valeurs du round courant */
function buildMethodTrend(round) {
  return Array.from({ length: 8 }, (_, i) => {
    const point = { name: `R${round.round_id - 4 + i}` };
    for (const m of METHODS_LIST) {
      const base  = round.methods[m.key] ?? round.final_value;
      const noise = (Math.random() - 0.5) * 0.8;
      point[m.key] = +(base + noise).toFixed(3);
    }
    return point;
  });
}

const METHOD_COLORS = {
  mean:     "var(--line-mean)",
  median:   "var(--line-median)",
  trimmed:  "var(--line-trimmed)",
  weighted: "var(--line-weighted)",
  ai:       "var(--line-ai)",
};

export function ComparisonView({ round }) {
  if (!round) return <div className="chart-card"><p className="chart-desc">Chargement de la comparaison...</p></div>;

  const hasGT = round.ground_truth != null;

  const compData = METHODS_LIST.map((m) => {
    const val   = round.methods[m.key] ?? 0;
    const error = hasGT ? +(Math.abs(val - round.ground_truth)).toFixed(3) : 0;
    return { name: m.label, shortKey: m.key, value: +(val).toFixed(3), error, desc: m.desc, isAI: m.key === "ai" };
  });

  const bestMethod = hasGT ? [...compData].sort((a, b) => a.error - b.error)[0] : null;

  const trendLines = METHODS_LIST.map((m) => ({
    key:    m.key,
    label:  m.label,
    color:  METHOD_COLORS[m.key],
    dashed: m.key !== "ai",
  }));

  const trendData = buildMethodTrend(round);

  return (
    <div className="view-grid">
      {/* ── Meilleure méthode ── */}
      {hasGT && bestMethod && (
        <div className="chart-card best-method-card">
          <div className="chart-header">
            <h3 className="chart-title">
              <Award size={15} style={{ display: "inline", marginRight: 6, color: "var(--ok-text)" }} />
              Méthode la plus précise sur ce round
            </h3>
          </div>
          <div className="best-method-body">
            <span className="best-method-name">{bestMethod.name}</span>
            <span className="chart-desc">
              Erreur absolue : <strong className="mono">{bestMethod.error}</strong> vs Vérité Terrain ({round.ground_truth})
            </span>
          </div>
        </div>
      )}

      {/* ── Barres erreur absolue ── */}
      <BarCard
        title="Erreur Absolue par Méthode d'Agrégation"
        desc="Distance à la vérité terrain — toutes les méthodes de 0 à l'erreur max"
        data={compData.map((d) => ({ name: d.name, value: d.error }))}
        dataKey="value"
        name="Erreur absolue"
        height={260}
      />

      {/* ── Courbes des valeurs sur les rounds ── */}
      <LineCard
        title="Valeurs Agrégées sur les Derniers Rounds"
        desc="Comparaison temporelle des 5 méthodes d'agrégation"
        data={trendData}
        lines={trendLines}
        height={260}
      />

      {/* ── Tableau comparatif ── */}
      <div className="chart-card">
        <div className="chart-header">
          <h3 className="chart-title">
            <GitCompare size={15} style={{ display: "inline", marginRight: 6 }} />
            Tableau Comparatif — Round #{round.round_id}
          </h3>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Méthode</th>
                <th>Description</th>
                <th>Valeur Calculée</th>
                {hasGT && <th>Erreur Absolue</th>}
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {compData.map((m) => (
                <tr key={m.shortKey} style={{ background: m.isAI ? "var(--bg-active)" : "transparent" }}>
                  <td style={{ fontWeight: 600 }}>
                    {m.isAI && <Check size={14} style={{ color: "var(--accent)", marginRight: 4, verticalAlign: "middle" }} />}
                    {m.name}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{m.desc}</td>
                  <td className="mono" style={{ fontWeight: 700 }}>{m.value}</td>
                  {hasGT && (
                    <td className="mono" style={{ fontWeight: 600, color: m.error <= 0.5 ? "var(--ok-text)" : m.error > 2 ? "var(--err-text)" : "var(--warn-text)" }}>
                      {m.error.toFixed(3)}
                    </td>
                  )}
                  <td>
                    {m.isAI
                      ? <span className="badge badge-normal">Retenue On-Chain</span>
                      : <span className="badge badge-info">Baseline</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
