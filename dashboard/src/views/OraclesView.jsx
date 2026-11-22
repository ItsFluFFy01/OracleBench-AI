import React from "react";
import { Users, AlertCircle, CheckCircle, TrendingUp } from "lucide-react";
import { StatChip } from "../components/StatChip";
import { DonutCard } from "../components/DonutCard";
import { BarCard }   from "../components/BarCard";

export function OraclesView({ round }) {
  if (!round) return <div className="chart-card"><p className="chart-desc">Chargement des oracles...</p></div>;

  const alertCount  = round.per_oracle.filter((o) => o.status === "ALERT").length;
  const normalCount = round.per_oracle.length - alertCount;
  const avgRep      = (round.per_oracle.reduce((s, o) => s + o.reputation, 0) / round.per_oracle.length).toFixed(2);
  const avgAnomaly  = (round.per_oracle.reduce((s, o) => s + o.anomaly_score, 0) / round.per_oracle.length).toFixed(3);

  const barData = round.per_oracle.map((o) => ({
    name: o.oracle_id,
    value: o.value,
    status: o.status,
  }));

  const donutData = [
    { name: "NORMAL", value: normalCount, color: "var(--donut-normal)" },
    { name: "ALERT",  value: alertCount,  color: "var(--donut-alert)"  },
  ];

  return (
    <div className="view-grid">
      {/* ── Ligne 1 : StatChips ── */}
      <div className="stat-row">
        <StatChip label="Total Oracles"       value={round.per_oracle.length} icon={Users}        badge={`Round #${round.round_id}`} badgeType="neu" />
        <StatChip label="Alertes (IF)"         value={alertCount}              icon={AlertCircle}  badge={alertCount > 0 ? "ALERT" : "OK"} badgeType={alertCount > 0 ? "err" : "ok"} />
        <StatChip label="Réputation Moyenne"   value={`${(avgRep * 100).toFixed(0)}%`} icon={TrendingUp} badge={avgRep >= 0.8 ? "Haute" : "Moyenne"} badgeType={avgRep >= 0.8 ? "ok" : "warn"} />
        <StatChip label="Score Anomalie Moyen" value={avgAnomaly}              icon={CheckCircle}  badgeType="neu" />
      </div>

      {/* ── Ligne 2 : Barres oracles + Donut NORMAL/ALERT ── */}
      <div className="chart-row-2">
        <BarCard
          title="Valeurs Rapportées par Nœud Oracle"
          desc="Chaque barre représente la valeur soumise par un oracle pour ce round"
          data={barData}
          dataKey="value"
          name="Valeur"
          height={280}
        />
        <DonutCard
          title="Répartition NORMAL / ALERT"
          data={donutData}
          centerLabel="oracles"
        />
      </div>

      {/* ── Ligne 3 : Tableau ── */}
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
                <th>Score d'Anomalie (IA)</th>
                <th>Réputation</th>
                <th>Écart à la Finale</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {round.per_oracle.map((o) => {
                const isAlert = o.status === "ALERT";
                const diff    = +(o.value - round.final_value).toFixed(2);
                return (
                  <tr key={o.oracle_id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{o.oracle_id}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{o.value.toFixed(2)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div className="progress-bar-bg" style={{ width: 60, marginTop: 0 }}>
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.round(o.anomaly_score * 100))}%`,
                              background: isAlert ? "var(--err-text)" : "var(--ok-text)",
                            }}
                          />
                        </div>
                        <span className="mono" style={{ fontSize: "0.8rem" }}>{o.anomaly_score.toFixed(3)}</span>
                      </div>
                    </td>
                    <td className="mono" style={{ color: o.reputation >= 0.8 ? "var(--ok-text)" : "var(--warn-text)" }}>
                      {(o.reputation * 100).toFixed(0)}%
                    </td>
                    <td className="mono" style={{ color: Math.abs(diff) > 2 ? "var(--err-text)" : "var(--text-body)" }}>
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
