import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function GasHistoryChart({ history }) {
  if (!history || history.length === 0) return <div>Aucune mesure de gas disponible.</div>;

  const data = history.slice(0, 50).map((h) => ({
    round: `#${h.round_id}`,
    gas: h.gas_used,
    confirmation: h.confirmation_ms,
  }));

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Consommation de Gas On-Chain par Round</h3>
          <p className="chart-desc">
            Mesures issues de `gas_measurements.csv` : stabilisation autour de 145 040 gas après initialisation.
          </p>
        </div>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 15, bottom: 20 }}>
            <defs>
              <linearGradient id="gasGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis dataKey="round" stroke="#94a3b8" interval={4} />
            <YAxis stroke="#94a3b8" domain={[140000, 165000]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                borderColor: "#334155",
                borderRadius: "8px",
                color: "#f8fafc",
              }}
              formatter={(val) => [`${val.toLocaleString()} gas`, "Gas Utilisé"]}
            />
            <Area
              type="monotone"
              dataKey="gas"
              stroke="#f59e0b"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gasGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
