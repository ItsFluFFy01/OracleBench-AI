import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LabelList, ResponsiveContainer,
} from "recharts";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-dot" style={{ background: "var(--grad-bar-a)" }} />
          <span>{p.name} : <strong>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

/**
 * Carte graphique en barres avec dégradé.
 * data: Array<{ name, value, ... }>
 * dataKey: clé numérique à tracer
 */
export function BarCard({
  title,
  desc,
  data = [],
  dataKey = "value",
  name,
  height = 260,
  domain = [0, "auto"],
}) {
  const gradId = "barCardGrad";
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
          <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--grad-bar-a)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--grad-bar-b)" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 11 }} domain={domain} />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey={dataKey}
              name={name || dataKey}
              fill={`url(#${gradId})`}
              radius={[6, 6, 0, 0]}
            >
              <LabelList
                dataKey={dataKey}
                position="top"
                style={{ fill: "var(--text-muted)", fontSize: 10 }}
                formatter={(v) => (typeof v === "number" ? v.toFixed(3) : v)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
