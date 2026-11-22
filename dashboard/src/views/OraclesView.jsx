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
import { Users, AlertCircle, CheckCircle } from "lucide-react";

export function OraclesView({ round }) {
  if (!round) return <div className="card">Chargement des oracles...</div>;

  const chartData = round.per_oracle.map((o) => ({
    name: o.oracle_id,
    valeur: o.value,
    score: o.anomaly_score,
    reputation: o.reputation,
    status: o.status,
    ecart: +(o.value - round.final_value).toFixed(2),
  }));

  return (
    <div>
      {/* Graphique de dispersion / comparaison des valeurs */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Rapports des Oracles vs Valeur Finale Retenue</h3>
            <p className="chart-desc">
              Visualisation des déviations : les nœuds en alerte (rouge) s'écartent fortement du consensus.
            </p>
          </div>
        </div>

        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
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
                  `${val} (Écart : ${item.payload.ecart > 0 ? "+" : ""}${item.payload.ecart})`,
                  "Valeur rapportée",
                ]}
              />
              <ReferenceLine
                y={round.final_value}
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: `Valeur Finale IA : ${round.final_value}`,
                  fill: "#818cf8",
                  position: "top",
                  fontSize: 12,
                }}
              />
              {round.ground_truth !== undefined && (
                <ReferenceLine
                  y={round.ground_truth}
                  stroke="#10b981"
                  strokeWidth={2}
                  label={{
                    value: `Vérité Terrain : ${round.ground_truth}`,
                    fill: "#34d399",
                    position: "bottom",
                    fontSize: 12,
                  }}
                />
              )}
              <Bar dataKey="valeur" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.status === "ALERT" ? "#ef4444" : "#6366f1"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau détaillé des oracles */}
      <div className="card">
        <div className="card-title">
          <span>Détail des Observations par Nœud Oracle (Round #{round.round_id})</span>
          <Users size={18} />
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nœud Oracle</th>
                <th>Valeur Rapportée</th>
                <th>Score d'Anomalie (IA)</th>
                <th>Réputation</th>
                <th>Écart à la Finale</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {round.per_oracle.map((o) => {
                const isAlert = o.status === "ALERT";
                const diff = +(o.value - round.final_value).toFixed(2);
                return (
                  <tr key={o.oracle_id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {o.oracle_id}
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {o.value.toFixed(2)}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div
                          className="progress-bar-bg"
                          style={{ width: "60px", marginTop: 0 }}
                        >
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.round(o.anomaly_score * 100))}%`,
                              background: isAlert ? "var(--accent-danger)" : "var(--accent-success)",
                            }}
                          />
                        </div>
                        <span className="mono" style={{ fontSize: "0.8rem" }}>
                          {o.anomaly_score.toFixed(3)}
                        </span>
                      </div>
                    </td>
                    <td className="mono">
                      <span
                        style={{
                          color: o.reputation >= 0.8 ? "var(--accent-success)" : "var(--accent-warning)",
                        }}
                      >
                        {(o.reputation * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td
                      className="mono"
                      style={{
                        color: diff === 0 ? "var(--text-muted)" : Math.abs(diff) > 2 ? "var(--accent-danger)" : "var(--text-main)",
                      }}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td>
                      <span className={`badge ${isAlert ? "badge-alert" : "badge-normal"}`}>
                        {isAlert ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
                        {o.status}
                      </span>
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
