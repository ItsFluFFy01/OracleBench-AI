import React from "react";
import { Users, AlertCircle, CheckCircle, TrendingUp, ShieldAlert } from "lucide-react";
import { StatChip } from "../components/StatChip";
import { DonutCard } from "../components/DonutCard";
import { BarCard }   from "../components/BarCard";

export function OraclesView({ round }) {
  if (!round || !round.per_oracle) {
    return <div className="chart-card"><p className="chart-desc">Chargement des oracles...</p></div>;
  }

  const alertCount  = round.per_oracle.filter((o) => o.status === "ALERT").length;
  const normalCount = round.per_oracle.length - alertCount;
  const avgRep      = (round.per_oracle.reduce((s, o) => s + (o.reputation ?? 0), 0) / round.per_oracle.length).toFixed(2);
  const avgAnomaly  = (round.per_oracle.reduce((s, o) => s + (o.anomaly_score ?? 0), 0) / round.per_oracle.length).toFixed(3);

  const values = round.per_oracle.map((o) => o.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = Math.max(0.2, (maxVal - minVal) * 0.15);
  const domainY = [Number((minVal - pad).toFixed(2)), Number((maxVal + pad).toFixed(2))];

  const barData = round.per_oracle.map((o) => ({
    name: o.oracle_id,
    value: Number(o.value.toFixed(2)),
    status: o.status,
  }));

  const donutData = [
    { name: "Sains (NORMAL)", value: normalCount, color: "var(--donut-normal, #10b981)" },
    { name: "Anomalies (ALERT)", value: alertCount,  color: "var(--donut-alert, #ef4444)"  },
  ];

  return (
    <div className="view-grid">
      {/* ── Ligne 1 : StatChips ── */}
      <div className="stat-row">
        <StatChip
          label="Total Oracles"
          value={round.per_oracle.length}
          icon={Users}
          badge={`Round #${round.round_id}`}
          badgeType="neu"
        />
        <StatChip
          label="Oracles en Alerte (IF)"
          value={alertCount}
          icon={AlertCircle}
          badge={alertCount > 0 ? `${alertCount} rejeté(s)` : "Tous acceptés"}
          badgeType={alertCount > 0 ? "err" : "ok"}
        />
        <StatChip
          label="Réputation Moyenne"
          value={`${(avgRep * 100).toFixed(0)}%`}
          icon={TrendingUp}
          badge={avgRep >= 0.8 ? "Haute" : "Moyenne"}
          badgeType={avgRep >= 0.8 ? "ok" : "warn"}
        />
        <StatChip
          label="Score Anomalie Moyen"
          value={avgAnomaly}
          icon={CheckCircle}
          badge={avgAnomaly < 0.5 ? "Sain (< 0.5)" : "Élevé (≥ 0.5)"}
          badgeType={avgAnomaly < 0.5 ? "ok" : "warn"}
        />
      </div>

      {/* ── Ligne 2 : Barres oracles + Donut NORMAL/ALERT ── */}
      <div className="chart-row-2">
        <BarCard
          title="Valeurs Rapportées par Nœud Oracle"
          desc={`Écart entre les rapports — Consensus IA final retenu : ${round.final_value?.toFixed(2)}`}
          data={barData}
          dataKey="value"
          name="Valeur rapportée"
          height={280}
          domain={domainY}
        />
        <DonutCard
          title="Classification Isolation Forest"
          data={donutData}
          centerLabel="oracles"
        />
      </div>

      {/* ── Ligne 3 : Tableau d'inspection détaillée ── */}
      <div className="chart-card">
        <div className="chart-header">
          <h3 className="chart-title">
            <Users size={15} style={{ display: "inline", marginRight: 6 }} />
            Détail par Nœud Oracle — Round #{round.round_id}
          </h3>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nœud Oracle</th>
                <th>Valeur Rapportée</th>
                <th>Score d'Anomalie (IF)</th>
                <th>Réputation Dynamique</th>
                <th>Écart au Consensus IA</th>
                <th>Décision</th>
              </tr>
            </thead>
            <tbody>
              {round.per_oracle.map((o) => {
                const isAlert = o.status === "ALERT";
                const diff    = +(o.value - round.final_value).toFixed(2);
                return (
                  <tr key={o.oracle_id} style={{ background: isAlert ? "rgba(239, 68, 68, 0.05)" : "transparent" }}>
                    <td className="mono" style={{ fontWeight: 600 }}>{o.oracle_id}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{o.value.toFixed(2)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div className="progress-bar-bg" style={{ width: 60, marginTop: 0 }}>
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.round(o.anomaly_score * 100))}%`,
                              background: isAlert ? "var(--err-text, #ef4444)" : "var(--ok-text, #10b981)",
                            }}
                          />
                        </div>
                        <span className="mono" style={{ fontSize: "0.8rem", color: isAlert ? "var(--err-text)" : "var(--text-muted)" }}>
                          {o.anomaly_score.toFixed(3)}
                        </span>
                      </div>
                    </td>
                    <td className="mono" style={{ color: o.reputation >= 0.8 ? "var(--ok-text)" : o.reputation < 0.5 ? "var(--err-text)" : "var(--warn-text)" }}>
                      {(o.reputation * 100).toFixed(0)}%
                    </td>
                    <td className="mono" style={{ color: Math.abs(diff) > 2 ? "var(--err-text)" : "var(--text-body)" }}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td>
                      <span className={`badge ${isAlert ? "badge-alert" : "badge-normal"}`}>
                        {isAlert ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
                        {isAlert ? "REJETÉ (ALERT)" : "ACCEPTÉ"}
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
