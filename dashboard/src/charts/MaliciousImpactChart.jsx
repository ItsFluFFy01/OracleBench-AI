import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export function MaliciousImpactChart({ data }) {
  if (!data || data.length === 0) return <div>Chargement...</div>;

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Évolution de l'Erreur (MAE) vs Pourcentage d'Oracles Malveillants</h3>
          <p className="chart-desc">
            Résistance aux attaques (Spike, Biais, Collusion) : la méthode IA maintient une MAE inférieure à 0.8 même à 50% d'oracles corrompus.
          </p>
        </div>
      </div>

      <div style={{ width: "100%", height: 340 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis
              dataKey="malicious_pct"
              stroke="#94a3b8"
              unit="%"
              label={{ value: "% d'Oracles Malveillants", position: "bottom", offset: 0, fill: "#94a3b8", fontSize: 12 }}
            />
            <YAxis
              stroke="#94a3b8"
              label={{ value: "MAE (Erreur Moyenne)", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                borderColor: "#334155",
                borderRadius: "8px",
                color: "#f8fafc",
              }}
              formatter={(val, name) => [`${val.toFixed(2)}`, name]}
            />
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "0.85rem" }} />
            <Line
              type="monotone"
              dataKey="mean_mae"
              name="Moyenne Simple"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="median_mae"
              name="Médiane"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="trimmed_mae"
              name="Moyenne Tronquée"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="weighted_mae"
              name="Moyenne Pondérée"
              stroke="#a855f7"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="ai_mae"
              name="Pipeline IA (OracleBench)"
              stroke="#10b981"
              strokeWidth={3.5}
              dot={{ r: 5, fill: "#10b981" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
