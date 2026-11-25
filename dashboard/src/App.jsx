import React, { useState, useEffect } from "react";
import { Sidebar }         from "./components/Sidebar";
import { ThemeToggle }     from "./components/ThemeToggle";
import { RoundSelector }   from "./components/RoundSelector";
import { RoundView }       from "./views/RoundView";
import { OraclesView }     from "./views/OraclesView";
import { ComparisonView }  from "./views/ComparisonView";
import { BlockchainView }  from "./views/BlockchainView";
import { ExperimentsView } from "./views/ExperimentsView";
import { LiveView }        from "./views/LiveView";
import { getRounds, getRoundById } from "./api";
import { config } from "./config";

const VIEW_TITLES = {
  live:        { title: "Mode Live — Calculs en Direct", sub: "Révélation pas-à-pas et simulation des étapes d'un round en temps réel" },
  round:       { title: "Analyse du Round",         sub: "Valeur agrégée, confiance et intégrité cryptographique" },
  oracles:     { title: "Nœuds Oracles",             sub: "Détail des observations et détection d'anomalies (Isolation Forest)" },
  comparison:  { title: "Comparaison des Méthodes",  sub: "Benchmarking des stratégies d'agrégation" },
  blockchain:  { title: "Blockchain & Smart Contract", sub: "Enregistrement on-chain, gas et latence" },
  experiments: { title: "Résultats Expérimentaux",   sub: "Métriques globales sur l'ensemble de la campagne" },
};

export function App() {
  const [activeTab,        setActiveTab]        = useState("round");
  const [rounds,           setRounds]           = useState([]);
  const [selectedRoundId,  setSelectedRoundId]  = useState(1);
  const [currentRound,     setCurrentRound]     = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [isMockMode,       setIsMockMode]       = useState(config.useMocks);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getRounds();
      setRounds(data);
      if (data?.length > 0) {
        const targetId = selectedRoundId || data[0].round_id;
        const fullRound = await getRoundById(targetId);
        setCurrentRound(fullRound || data[0]);
        setSelectedRoundId(targetId);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [isMockMode]);

  async function handleSelectRound(id) {
    setSelectedRoundId(id);
    const rd = await getRoundById(id);
    setCurrentRound(rd);
  }

  function handleToggleMockMode() {
    const nextVal = !config.useMocks;
    config.setUseMocks(nextVal);
    setIsMockMode(nextVal);
  }

  const { title, sub } = VIEW_TITLES[activeTab] || { title: activeTab, sub: "" };

  return (
    <div className="app-shell">
      <Sidebar active={activeTab} onNavigate={setActiveTab} rounds={rounds} />

      <div className="main-area">
        {/* ── Top bar ── */}
        <div className="top-bar">
          <div className="top-bar-left">
            <div className="top-bar-title">{title}</div>
            <div className="top-bar-sub">{sub}</div>
          </div>
          <div className="top-bar-right" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {/* Pill indiquant la source de données avec toggle */}
            <button
              onClick={handleToggleMockMode}
              style={{
                cursor: "pointer",
                padding: "0.4rem 0.8rem",
                borderRadius: "999px",
                border: "1px solid var(--border-card, #cbd5e1)",
                background: "var(--bg-card, #ffffff)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-main, #0f172a)",
                transition: "all 0.2s ease",
              }}
              title="Cliquer pour basculer entre l'API Flask réelle de la Partie B et les mocks"
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: isMockMode ? "#f59e0b" : "#10b981",
                  boxShadow: isMockMode ? "0 0 6px #f59e0b" : "0 0 6px #10b981",
                  display: "inline-block",
                }}
              />
              <span>{isMockMode ? "Source : Mocks locaux" : "Source : API Flask Réelle (Partie B)"}</span>
            </button>

            {activeTab !== "experiments" && activeTab !== "live" && (
              <RoundSelector
                currentRoundId={selectedRoundId}
                totalRounds={rounds.length || 50}
                onSelectRound={handleSelectRound}
                onRefresh={loadData}
              />
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* ── Contenu ── */}
        <div className="page-content">
          {loading ? (
            <div className="chart-card loading-card">
              <p className="chart-desc">Chargement des données OracleBench-AI…</p>
            </div>
          ) : (
            <>
              {activeTab === "live"        && <LiveView />}
              {activeTab === "round"       && <RoundView      round={currentRound} allRounds={rounds} />}
              {activeTab === "oracles"     && <OraclesView    round={currentRound} />}
              {activeTab === "comparison"  && <ComparisonView round={currentRound} allRounds={rounds} />}
              {activeTab === "blockchain"  && <BlockchainView round={currentRound} />}
              {activeTab === "experiments" && <ExperimentsView />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
