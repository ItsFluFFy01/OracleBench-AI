import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { RoundSelector } from "./components/RoundSelector";
import { RoundView } from "./views/RoundView";
import { OraclesView } from "./views/OraclesView";
import { ComparisonView } from "./views/ComparisonView";
import { BlockchainView } from "./views/BlockchainView";
import { ExperimentsView } from "./views/ExperimentsView";
import { getRounds, getRoundById } from "./api";

export function App() {
  const [activeTab, setActiveTab] = useState("round");
  const [rounds, setRounds] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState(1);
  const [currentRound, setCurrentRound] = useState(null);
  const [loading, setLoading] = useState(true);

  // Chargement initial des rounds
  async function loadData() {
    setLoading(true);
    try {
      const data = await getRounds();
      setRounds(data);
      if (data && data.length > 0) {
        const found = data.find((r) => r.round_id === selectedRoundId) || data[0];
        setCurrentRound(found);
        setSelectedRoundId(found.round_id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Changement de round
  async function handleSelectRound(id) {
    setSelectedRoundId(id);
    const roundData = await getRoundById(id);
    setCurrentRound(roundData);
  }

  return (
    <div className="app-container">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="main-content">
        {/* Barre de contrôle du round (affichée pour les vues par round) */}
        {activeTab !== "experiments" && (
          <RoundSelector
            currentRoundId={selectedRoundId}
            totalRounds={rounds.length || 50}
            onSelectRound={handleSelectRound}
            onRefresh={loadData}
          />
        )}

        {loading ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            Chargement des données OracleBench...
          </div>
        ) : (
          <>
            {activeTab === "round" && <RoundView round={currentRound} />}
            {activeTab === "oracles" && <OraclesView round={currentRound} />}
            {activeTab === "comparison" && <ComparisonView round={currentRound} />}
            {activeTab === "blockchain" && <BlockchainView round={currentRound} />}
            {activeTab === "experiments" && <ExperimentsView />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
