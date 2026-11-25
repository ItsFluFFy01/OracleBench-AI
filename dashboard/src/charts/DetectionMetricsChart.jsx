import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export function DetectionMetricsChart({ detection }) {
  if (!detection) return <div>Chargement...</div>;

  const chartData = [
    { name: "Précision", value: +(detection.precision * 100).toFixed(1), color: "#6366f1", desc: "Oracles signalés réellement anormaux" },
    { name: "Rappel (Recall)", value: +(detection.recall * 100).toFixed(1), color: "#0ea5e9", desc: "Totalité des attaques détectées" },
    { name: "F1-Score", value: +(detection.f1 * 100).toFixed(1), color: "#10b981", desc: "Moyenne harmonique Précision/Rappel" },
    { name: "Faux Positifs (FPR)", value: +(detection.fpr * 100).toFixed(1), color: "#f59e0b", desc: "Nœuds sains faussement pénalisés" },
  ];

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Performances de Détection IA (Isolation Forest)</h3>
          <p className="chart-desc">Évaluation de la classification binaire NORMAL vs ALERT</p>
        </div>
      </div>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                borderColor: "#334155",
                borderRadius: "8px",
                color: "#f8fafc",
              }}
              formatter={(val, name, item) => [`${val}% — ${item.payload.desc}`, "Taux"]}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
