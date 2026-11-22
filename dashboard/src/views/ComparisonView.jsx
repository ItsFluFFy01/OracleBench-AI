import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { GitCompare, Award, Check } from "lucide-react";

export function ComparisonView({ round }) {
  if (!round) return <div className="card">Chargement de la comparaison...</div>;

  const hasGroundTruth = round.ground_truth !== undefined && round.ground_truth !== null;

  const methodsList = [
    { key: "mean", label: "Moyenne Simple", desc: "Sensible aux spikes et valeurs extrêmes" },
    { key: "median", label: "Médiane Simple", desc: "Robuste aux spikes unilatéraux isolés" },
    { key: "trimmed", label: "Moyenne Tronquée", desc: "Élimine min et max avant moyenne" },
    { key: "weighted", label: "Moyenne Pondérée", desc: "Pondération selon réputation historique" },
    { key: "ai", label: "Pipeline IA (OracleBench)", desc: "Filtrage Isolation Forest + Réputation" },
  ];

  const comparisonData = methodsList.map((m) => {
    const val = round.methods[m.key];
    const error = hasGroundTruth ? +(Math.abs(val - round.ground_truth)).toFixed(3) : 0;
    return {
      key: m.key,
      name: m.label,
      valeur: val,
      error: error,
      desc: m.desc,
      isAI: m.key === "ai",
    };
  });

  // Tri par erreur minimale pour mettre en avant la meilleure méthode
  const bestMethod = hasGroundTruth
    ? [...comparisonData].sort((a, b) => a.error - b.error)[0]
    : null;

  return (
    <div>
      {/* Cartes résumé */}
      {hasGroundTruth && bestMethod && (
        <div className="card" style={{ marginBottom: "1.5rem", borderLeft: "4px solid var(--accent-success)" }}>
          <div className="card-title">
            <span>Méthode la plus précise sur ce round</span>
            <Award size={18} color="var(--accent-success)" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
            <span className="card-value" style={{ color: "var(--accent-success)" }}>
              {bestMethod.name}
            </span>
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Erreur absolue : <strong className="mono">{bestMethod.error}</strong> vs Vérité Terrain ({round.ground_truth})
            </span>
          </div>
        </div>
      )}

      {/* Graphique de comparaison des valeurs produites */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Comparaison des Valeurs Agrégées par Méthode</h3>
            <p className="chart-desc">
              Évaluation du comportement de chaque stratégie d'agrégation face au jeu d'oracles.
            </p>
          </div>
        </div>

        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  color: "#f8fafc",
                }}
                formatter={(val, name, item) => [
                  `${val} ${hasGroundTruth ? `(Erreur : ${item.payload.error})` : ""}`,
                  "Valeur estimée",
                ]}
              />
              {hasGroundTruth && (
                <ReferenceLine
                  y={round.ground_truth}
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: `Vérité Terrain : ${round.ground_truth}`,
                    fill: "#34d399",
                    position: "top",
                    fontSize: 12,
                  }}
                />
              )}
              <Bar dataKey="valeur" radius={[6, 6, 0, 0]}>
                {comparisonData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.isAI ? "#6366f1" : "#475569"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau comparatif détaillé */}
      <div className="card">
        <div className="card-title">
          <span>Tableau Comparatif des Méthodes (Round #{round.round_id})</span>
          <GitCompare size={18} />
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Méthode</th>
                <th>Description</th>
                <th>Valeur Calculée</th>
                {hasGroundTruth && <th>Erreur Absolue</th>}
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((m) => {
                const isSelected = m.isAI;
                return (
                  <tr
                    key={m.key}
                    style={{
                      background: isSelected ? "rgba(99, 102, 241, 0.08)" : "transparent",
                    }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {m.isAI && <Check size={16} color="var(--accent-primary)" />}
                        <span>{m.name}</span>
                      </div>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{m.desc}</td>
                    <td className="mono" style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                      {m.valeur.toFixed(2)}
                    </td>
                    {hasGroundTruth && (
                      <td className="mono" style={{ fontWeight: 600 }}>
                        <span
                          style={{
                            color: m.error <= 0.5 ? "var(--accent-success)" : m.error > 2 ? "var(--accent-danger)" : "var(--accent-warning)",
                          }}
                        >
                          {m.error.toFixed(3)}
                        </span>
                      </td>
                    )}
                    <td>
                      {m.isAI ? (
                        <span className="badge badge-normal" style={{ background: "rgba(99, 102, 241, 0.2)", color: "#818cf8" }}>
                          Retenue On-Chain
                        </span>
                      ) : (
                        <span className="badge badge-info" style={{ background: "rgba(148, 163, 184, 0.1)", color: "#94a3b8" }}>
                          Baseline
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
