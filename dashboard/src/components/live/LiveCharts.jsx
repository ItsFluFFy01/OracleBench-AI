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

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-dot" style={{ background: p.color }} />
          <span>
            {p.name} : <strong>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Retourne l'erreur absolue d'une méthode par rapport à la vérité terrain */
function getRoundError(r, method) {
  if (r.errors && typeof r.errors[method] === "number") {
    return r.errors[method];
  }
  const val = method === "ai" ? (r.methods?.ai ?? r.final_value) : r.methods?.[method];
  if (typeof r.ground_truth === "number" && typeof val === "number") {
    return Math.abs(val - r.ground_truth);
  }
  return null;
}

export function LiveCharts({ history = [] }) {
  if (!history || history.length === 0) {
    return null;
  }

  const showDots = history.length <= 3 ? { r: 3 } : false;

  // 1. Données du graphique de consensus temporel
  const trackingData = history.map((r) => ({
    name: `R${r.round_id}`,
    truth: typeof r.ground_truth === "number" ? +r.ground_truth.toFixed(3) : undefined,
    ai: typeof r.final_value === "number" ? +r.final_value.toFixed(3) : undefined,
    mean: typeof r.methods?.mean === "number" ? +r.methods.mean.toFixed(3) : undefined,
    median: typeof r.methods?.median === "number" ? +r.methods.median.toFixed(3) : undefined,
  }));

  // 2. Calcul de la MAE cumulée (running MAE) par méthode
  let sumErrMean = 0;
  let sumErrMedian = 0;
  let sumErrAI = 0;
  let sumErrTrimmed = 0;
  let sumErrWeighted = 0;
  let countWithGt = 0;

  const maeData = history.map((r) => {
    const errMean = getRoundError(r, "mean");
    const errMedian = getRoundError(r, "median");
    const errTrimmed = getRoundError(r, "trimmed");
    const errWeighted = getRoundError(r, "weighted");
    const errAI = getRoundError(r, "ai");

    if (errAI !== null) {
      countWithGt += 1;
      sumErrMean += errMean ?? errAI;
      sumErrMedian += errMedian ?? errAI;
      sumErrTrimmed += errTrimmed ?? errAI;
      sumErrWeighted += errWeighted ?? errAI;
      sumErrAI += errAI;
    }

    const denom = countWithGt || 1;
    return {
      name: `R${r.round_id}`,
      mean: countWithGt ? +(sumErrMean / denom).toFixed(3) : 0,
      median: countWithGt ? +(sumErrMedian / denom).toFixed(3) : 0,
      trimmed: countWithGt ? +(sumErrTrimmed / denom).toFixed(3) : 0,
      weighted: countWithGt ? +(sumErrWeighted / denom).toFixed(3) : 0,
      ai: countWithGt ? +(sumErrAI / denom).toFixed(3) : 0,
    };
  });

  // 3. Évolution des réputations des oracles
  const oracleIdSet = new Set();
  history.forEach((r) => {
    (r.per_oracle || []).forEach((o) => oracleIdSet.add(o.oracle_id));
  });
  const oracleIds = Array.from(oracleIdSet);

  const reputationData = history.map((r) => {
    const point = { name: `R${r.round_id}` };
    (r.per_oracle || []).forEach((o) => {
      point[o.oracle_id] = +(o.reputation * 100).toFixed(0);
    });
    return point;
  });

  // Palette harmonisée pour les oracles
  const oracleColors = [
    "#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899",
    "#8b5cf6", "#14b8a6", "#f97316", "#ef4444", "#3b82f6",
  ];

  return (
    <div className="live-charts-container">
      {/* ── Graphique 1 : Valeurs comparées ── */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Consensus en Direct vs Vérité Terrain</h3>
            <p className="chart-desc">
              Fenêtre glissante des {history.length} derniers rounds : robustesse du pipeline IA face aux baselines.
            </p>
          </div>
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={trackingData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />
              <Line type="monotone" dataKey="truth" name="Vérité Terrain" stroke="var(--line-truth)" strokeWidth={2.5} dot={showDots} />
              <Line type="monotone" dataKey="ai" name="Pipeline IA" stroke="var(--line-ai)" strokeWidth={2.5} dot={showDots} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="mean" name="Moyenne" stroke="var(--line-mean)" strokeWidth={1.5} dot={showDots} />
              <Line type="monotone" dataKey="median" name="Médiane" stroke="var(--line-median)" strokeWidth={1.5} dot={showDots} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Grille 2 colonnes : MAE Cumulée & Réputations ── */}
      <div className="chart-row-2">
        {/* Graphique 2 : MAE Courante */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Erreur Absolue Moyenne Cumulée (MAE)</h3>
              <p className="chart-desc">Évolution en temps réel de la précision de chaque méthode</p>
            </div>
          </div>
          <div style={{ width: "100%", height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={maeData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }} />
                <Line type="monotone" dataKey="ai" name="Pipeline IA" stroke="var(--line-ai)" strokeWidth={2} dot={showDots} />
                <Line type="monotone" dataKey="mean" name="Moyenne" stroke="var(--line-mean)" strokeWidth={1.5} dot={showDots} />
                <Line type="monotone" dataKey="median" name="Médiane" stroke="var(--line-median)" strokeWidth={1.5} dot={showDots} />
                <Line type="monotone" dataKey="trimmed" name="Tronquée" stroke="var(--line-trimmed)" strokeWidth={1.5} dot={showDots} />
                <Line type="monotone" dataKey="weighted" name="Pondérée" stroke="var(--line-weighted)" strokeWidth={1.5} dot={showDots} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graphique 3 : Évolution des Réputations */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Dynamique des Réputations par Nœud</h3>
              <p className="chart-desc">Score de réputation en % (pénalité ALERT, rétablissement progressif)</p>
            </div>
          </div>
          <div style={{ width: "100%", height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={reputationData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: "var(--text-muted)" }} />
                {oracleIds.map((id, index) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    name={id}
                    stroke={oracleColors[index % oracleColors.length]}
                    strokeWidth={1.5}
                    dot={showDots}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
