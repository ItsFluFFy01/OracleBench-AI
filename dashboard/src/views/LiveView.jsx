import React, { useState, useEffect, useRef } from "react";
import { config } from "../config";
import { LiveSimulationEngine } from "../engine/liveEngine";
import { LiveControls } from "../components/live/LiveControls";
import { CalculationPanel } from "../components/live/CalculationPanel";
import { LiveCharts } from "../components/live/LiveCharts";
import { AlertCircle, Radio, Wifi, WifiOff } from "lucide-react";

export function LiveView() {
  const isMockMode = config.useMocks;

  // Options du simulateur
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const [oracleCount, setOracleCount] = useState(10);
  const [maliciousPct, setMaliciousPct] = useState(20);
  const [attackType, setAttackType] = useState("spike");
  const [seed, setSeed] = useState(42);

  // État des calculs
  const [currentRound, setCurrentRound] = useState(null);
  const [history, setHistory] = useState([]);
  const [backendError, setBackendError] = useState(null);

  // Moteur de simulation locale
  const engineRef = useRef(null);
  const lastFetchedIdRef = useRef(0);

  // Initialisation du moteur
  useEffect(() => {
    if (isMockMode) {
      const engine = new LiveSimulationEngine({
        seed,
        oracleCount,
        maliciousPct,
        attackType,
      });
      engineRef.current = engine;
      // Génération du 1er round pour affichage initial
      const first = engine.computeNextRound();
      setCurrentRound(first);
      setHistory([first]);
    }
  }, [isMockMode]);

  // Mise à jour de la configuration de simulation
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.configure({
        seed,
        oracleCount,
        maliciousPct,
        attackType,
      });
    }
  }, [seed, oracleCount, maliciousPct, attackType]);

  // Boucle de lecture en direct (Tick timer)
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(async () => {
      if (isMockMode) {
        // Mode Simulation Navigateur
        if (engineRef.current) {
          const next = engineRef.current.computeNextRound();
          setCurrentRound(next);
          setHistory((prev) => {
            const updated = [...prev, next];
            return updated.length > 50 ? updated.slice(updated.length - 50) : updated;
          });
        }
      } else {
        // Mode Réel : Polling de l'API Flask de B
        // L'API retourne { rounds: [...], total: N } ou directement un tableau
        try {
          const res = await fetch(`${config.apiUrl}/rounds?limit=1&order=desc`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.rounds || []);
          if (list.length > 0) {
            const latest = list[0]; // order=desc → le plus récent en premier
            if (latest.round_id !== lastFetchedIdRef.current) {
              lastFetchedIdRef.current = latest.round_id;
              // Récupération des détails complets (per_oracle, methods, breakdown)
              try {
                const detailRes = await fetch(`${config.apiUrl}/rounds/${latest.round_id}`);
                const full = detailRes.ok ? await detailRes.json() : latest;
                setCurrentRound(full);
                setHistory((prev) => {
                  const updated = [...prev, full];
                  return updated.length > 50 ? updated.slice(updated.length - 50) : updated;
                });
              } catch {
                setCurrentRound(latest);
                setHistory((prev) => {
                  const updated = [...prev, latest];
                  return updated.length > 50 ? updated.slice(updated.length - 50) : updated;
                });
              }
            }
          }
          setBackendError(null);
        } catch (err) {
          setBackendError(`Backend injoignable (${err.message}) — Vérifiez que le service Flask est démarré.`);
        }
      }
    }, speed);

    return () => clearInterval(interval);
  }, [isPlaying, speed, isMockMode]);

  // Avancement pas à pas (Step)
  function handleStep() {
    if (isMockMode && engineRef.current) {
      const next = engineRef.current.computeNextRound();
      setCurrentRound(next);
      setHistory((prev) => {
        const updated = [...prev, next];
        return updated.length > 50 ? updated.slice(updated.length - 50) : updated;
      });
    }
  }

  // Réinitialisation de la simulation
  function handleReset() {
    setIsPlaying(false);
    if (isMockMode) {
      const engine = new LiveSimulationEngine({
        seed,
        oracleCount,
        maliciousPct,
        attackType,
      });
      engineRef.current = engine;
      const first = engine.computeNextRound();
      setCurrentRound(first);
      setHistory([first]);
    } else {
      setHistory([]);
      lastFetchedIdRef.current = 0;
    }
  }

  return (
    <div className="view-grid">
      {/* ── Bandeau Mode de fonctionnement ── */}
      {isMockMode ? (
        <div className="action-banner action-banner-warn" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Mode Simulation Navigateur actif (VITE_USE_MOCKS=true) :</strong> approximation de démonstration pour le benchmark, pas le moteur Python réel (Isolation Forest).
          </div>
        </div>
      ) : (
        <div className="action-banner action-banner-ok" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Wifi size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Mode Réel connecté (VITE_USE_MOCKS=false) :</strong> flux alimenté directement par le backend Flask et le modèle Isolation Forest de Personne B.
          </div>
        </div>
      )}

      {/* Erreur backend éventuelle */}
      {backendError && (
        <div className="action-banner action-banner-err" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <WifiOff size={18} style={{ flexShrink: 0 }} />
          <div>{backendError}</div>
        </div>
      )}

      {/* ── Commandes de pilotage du flux ── */}
      <LiveControls
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStep={handleStep}
        onReset={handleReset}
        speed={speed}
        onChangeSpeed={setSpeed}
        oracleCount={oracleCount}
        onChangeOracleCount={setOracleCount}
        maliciousPct={maliciousPct}
        onChangeMaliciousPct={setMaliciousPct}
        attackType={attackType}
        onChangeAttackType={setAttackType}
        seed={seed}
        onChangeSeed={setSeed}
        isMockMode={isMockMode}
      />

      {/* ── Panneau de calcul pas-à-pas (6 étapes) ── */}
      <CalculationPanel round={currentRound} isPlaying={isPlaying} />

      {/* ── Graphiques dynamiques en fenêtre glissante ── */}
      <LiveCharts history={history} />
    </div>
  );
}
