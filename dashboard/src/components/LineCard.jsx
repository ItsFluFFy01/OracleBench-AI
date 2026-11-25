import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-dot" style={{ background: p.color }} />
          <span>{p.name} : <strong>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

/**
 * Graphique en courbes lissées.
 * lines: Array<{ key, label, color, dashed? }>
 * data:  Array<{ [key]: number, ... }>
 */
export function LineCard({ title, desc, data = [], lines = [], height = 280 }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">{title}</h3>
          {desc && <p className="chart-desc">{desc}</p>}
        </div>
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
            />
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.label}
                stroke={l.color}
                strokeWidth={2}
                strokeDasharray={l.dashed ? "5 4" : undefined}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
