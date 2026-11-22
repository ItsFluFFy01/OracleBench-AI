import React from "react";

/**
 * Grande carte KPI avec fond dégradé.
 * variant: 1 (rose→violet) | 2 (turquoise→bleu)
 * confidence: nombre 0-1 → affiche une jauge sous la valeur
 */
export function KpiCard({ variant = 1, label, value, unit = "", sub, confidence }) {
  const cls = `kpi-card kpi-card-${variant}`;
  const pct = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className={cls}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {pct != null && (
        <div className="confidence-gauge-bg">
          <div className="confidence-gauge-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
