import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-dot" style={{ background: p.payload.color }} />
        <span>{p.name} : <strong>{p.value}</strong></span>
      </div>
    </div>
  );
}

/**
 * Carte graphique en donut avec légende latérale.
 * data: Array<{ name, value, color }>
 * centerLabel: texte court affiché au centre
 */
export function DonutCard({ title, data = [], centerLabel = "" }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="chart-card donut-card">
      <div className="chart-header">
        <h3 className="chart-title">{title}</h3>
      </div>
      <div className="donut-body">
        {/* Anneau */}
        <div className="donut-ring-wrap">
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Texte central */}
          <div className="donut-center">
            <div className="donut-center-value">{total}</div>
            <div className="donut-center-label">{centerLabel}</div>
          </div>
        </div>

        {/* Légende */}
        <div className="donut-legend">
          {data.map((d) => (
            <div key={d.name} className="donut-legend-item">
              <span className="donut-legend-dot" style={{ background: d.color }} />
              <span className="donut-legend-name">{d.name}</span>
              <span className="donut-legend-pct">
                {total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
