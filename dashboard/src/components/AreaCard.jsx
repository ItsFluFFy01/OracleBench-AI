import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-dot" style={{ background: p.color }} />
          <span>{p.name} : <strong>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

/**
 * Carte graphique en aire avec dégradé.
 * color: couleur de départ du dégradé (ex. "var(--grad-bar-a)")
 */
export function AreaCard({ title, desc, data = [], dataKey, name, color = "var(--grad-bar-a)", footerText, height = 220 }) {
  const gradId = `areaGrad-${dataKey}`;
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
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.6} />
                <stop offset="95%" stopColor={color} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey={dataKey}
              name={name || dataKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {footerText && (
        <div className="chart-card-footer">
          <span>{footerText}</span>
        </div>
      )}
    </div>
  );
}
