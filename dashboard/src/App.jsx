import React, { useState, useEffect } from "react";
import { Sidebar }         from "./components/Sidebar";
import { ThemeToggle }     from "./components/ThemeToggle";
import { RoundSelector }   from "./components/RoundSelector";
import { RoundView }       from "./views/RoundView";
import { OraclesView }     from "./views/OraclesView";
import { ComparisonView }  from "./views/ComparisonView";
import { BlockchainView }  from "./views/BlockchainView";
import { ExperimentsView } from "./views/ExperimentsView";
import { getRounds, getRoundById } from "./api";

const VIEW_TITLES = {
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

  async function loadData() {
    setLoading(true);
    try {
      const data = await getRounds();
      setRounds(data);
      if (data?.length > 0) {
        const found = data.find((r) => r.round_id === selectedRoundId) || data[0];
        setCurrentRound(found);
        setSelectedRoundId(found.round_id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleSelectRound(id) {
    setSelectedRoundId(id);
    const rd = await getRoundById(id);
    setCurrentRound(rd);
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
          <div className="top-bar-right">
            {activeTab !== "experiments" && (
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
              {activeTab === "round"       && <RoundView      round={currentRound} />}
              {activeTab === "oracles"     && <OraclesView    round={currentRound} />}
              {activeTab === "comparison"  && <ComparisonView round={currentRound} />}
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
