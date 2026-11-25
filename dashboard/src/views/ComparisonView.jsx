import React from "react";
import { GitCompare, Award, Check } from "lucide-react";
import { BarCard }  from "../components/BarCard";
import { LineCard } from "../components/LineCard";

const METHODS_LIST = [
  { key: "mean",     label: "Moyenne Simple",     desc: "Sensible aux spikes et aux attaques" },
  { key: "median",   label: "Médiane",            desc: "Robuste aux spikes isolés" },
  { key: "trimmed",  label: "Moyenne Tronquée",   desc: "Élimine les extrêmes min/max" },
  { key: "weighted", label: "Moyenne Pondérée",   desc: "Pondérée par la réputation dynamique" },
  { key: "ai",       label: "Pipeline IA (B)",    desc: "Isolation Forest + Réputation pondérée" },
];

/** Génère la série réelle des 5 méthodes autour du round courant */
function buildMethodTrend(currentRound, allRounds = []) {
  if (Array.isArray(allRounds) && allRounds.length > 0) {
    const sorted = [...allRounds].sort((a, b) => a.round_id - b.round_id);
    const curId = currentRound.round_id;
    const curIdx = sorted.findIndex((r) => r.round_id === curId);
    const startIdx = Math.max(0, curIdx - 4);
    const slice = sorted.slice(startIdx, startIdx + 9);
    return slice.map((r) => {
      const point = { name: `R${r.round_id}` };
      for (const m of METHODS_LIST) {
        const val = r.methods?.[m.key] ?? (m.key === "ai" ? r.final_value : null);
        if (val != null) {
          point[m.key] = Number(val.toFixed(2));
        }
      }
      if (r.ground_truth != null) {
        point["truth"] = Number(r.ground_truth.toFixed(2));
      }
      return point;
    });
  }
  const point = { name: `R${currentRound.round_id}` };
  for (const m of METHODS_LIST) {
    point[m.key] = currentRound.methods?.[m.key];
  }
  return [point];
}

const METHOD_COLORS = {
  truth:    "var(--line-truth, #3b82f6)",
  mean:     "var(--line-mean, #ef4444)",
  median:   "var(--line-median, #f59e0b)",
  trimmed:  "var(--line-trimmed, #8b5cf6)",
  weighted: "var(--line-weighted, #06b6d4)",
  ai:       "var(--line-ai, #10b981)",
};

export function ComparisonView({ round, allRounds = [] }) {
  if (!round || !round.methods) {
    return <div className="chart-card"><p className="chart-desc">Chargement de la comparaison...</p></div>;
  }

  const hasGT = round.ground_truth != null;

  const compData = METHODS_LIST.map((m) => {
    const val   = round.methods[m.key] ?? (m.key === "ai" ? round.final_value : 0);
    const error = hasGT ? +(Math.abs(val - round.ground_truth)).toFixed(3) : 0;
    return { name: m.label, shortKey: m.key, value: +(val).toFixed(2), error, desc: m.desc, isAI: m.key === "ai" };
  });

  const bestMethod = hasGT ? [...compData].sort((a, b) => a.error - b.error)[0] : null;

  const trendLines = [
    ...(hasGT ? [{ key: "truth", label: "Vérité Terrain", color: METHOD_COLORS.truth, dashed: false }] : []),
    ...METHODS_LIST.map((m) => ({
      key:    m.key,
      label:  m.label,
      color:  METHOD_COLORS[m.key],
      dashed: m.key !== "ai",
    })),
  ];

  const trendData = buildMethodTrend(round, allRounds);

  return (
    <div className="view-grid">
      {/* ── Meilleure méthode ── */}
      {hasGT && bestMethod && (
        <div className="chart-card best-method-card">
          <div className="chart-header">
            <h3 className="chart-title">
              <Award size={16} style={{ display: "inline", marginRight: 6, color: "var(--ok-text, #10b981)" }} />
              Méthode la plus précise sur le Round #{round.round_id}
            </h3>
          </div>
          <div className="best-method-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span className="best-method-name" style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--ok-text)" }}>
                {bestMethod.name}
              </span>
              <p className="chart-desc" style={{ marginTop: "0.2rem" }}>
                Erreur minimale par rapport à la vérité terrain : <strong className="mono" style={{ color: "var(--ok-text)" }}>{bestMethod.error}</strong> (Vérité = {round.ground_truth?.toFixed(2)})
              </p>
            </div>
            <div className="stat-chip" style={{ padding: "0.5rem 1rem", background: "var(--bg-active)" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Valeur retenue : </span>
              <strong className="mono" style={{ fontSize: "1.1rem", marginLeft: "0.3rem" }}>{bestMethod.value}</strong>
            </div>
          </div>
        </div>
      )}

      {/* ── Barres erreur absolue ── */}
      <BarCard
        title="Erreur Absolue par Méthode d'Agrégation (|Valeur - Vérité|)"
        desc="Comparatif direct de la précision de chaque stratégie — plus la barre est basse, plus la méthode est robuste"
        data={compData.map((d) => ({ name: d.name, value: d.error }))}
        dataKey="value"
        name="Erreur absolue"
        height={260}
      />

      {/* ── Courbes temporelles réelles des méthodes ── */}
      <LineCard
        title="Évolution Temporelle des 5 Stratégies d'Agrégation"
        desc="Comparaison des valeurs calculées sur la série des rounds réels de la Partie B"
        data={trendData}
        lines={trendLines}
        height={280}
      />

      {/* ── Tableau comparatif détaillé ── */}
      <div className="chart-card">
        <div className="chart-header">
          <h3 className="chart-title">
            <GitCompare size={15} style={{ display: "inline", marginRight: 6 }} />
            Tableau Comparatif des Stratégies — Round #{round.round_id}
          </h3>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Stratégie</th>
                <th>Principe & Résistance</th>
                <th>Valeur Agrégée</th>
                {hasGT && <th>Erreur Absolue</th>}
                <th>Rôle</th>
              </tr>
            </thead>
            <tbody>
              {compData.map((m) => (
                <tr key={m.shortKey} style={{ background: m.isAI ? "rgba(16, 185, 129, 0.08)" : "transparent" }}>
                  <td style={{ fontWeight: 600 }}>
                    {m.isAI && <Check size={14} style={{ color: "var(--ok-text)", marginRight: 4, verticalAlign: "middle" }} />}
                    {m.name}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{m.desc}</td>
                  <td className="mono" style={{ fontWeight: 700 }}>{m.value}</td>
                  {hasGT && (
                    <td className="mono" style={{ fontWeight: 600, color: m.error <= 0.3 ? "var(--ok-text)" : m.error > 1.5 ? "var(--err-text)" : "var(--warn-text)" }}>
                      {m.error.toFixed(3)}
                    </td>
                  )}
                  <td>
                    {m.isAI ? (
                      <span className="badge badge-normal" style={{ fontWeight: 600 }}>Retenue on-chain</span>
                    ) : (
                      <span className="badge badge-neu">Baseline A</span>
                    )}
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
