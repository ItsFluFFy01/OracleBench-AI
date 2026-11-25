import React, { useState, useEffect, useRef, useCallback } from "react";
import { config } from "../config";
import { LiveSimulationEngine } from "../engine/liveEngine";
import { LiveControls } from "../components/live/LiveControls";
import { CalculationPanel } from "../components/live/CalculationPanel";
import { LiveCharts } from "../components/live/LiveCharts";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";

/**
 * Enrichit un round brut issu du backend Flask (Partie B) avec les champs
 * dérivés attendus par CalculationPanel et LiveCharts (errors, old_reputation, confidence_formula).
 */
function normalizeRealRound(raw, prevRound = null) {
  if (!raw) return null;

  const prevRepMap = {};
  if (prevRound?.per_oracle) {
    for (const o of prevRound.per_oracle) {
      prevRepMap[o.oracle_id] = o.reputation;
    }
  }

  const perOracle = (raw.per_oracle || []).map((o) => {
    const oldRep = typeof o.old_reputation === "number"
      ? o.old_reputation
      : (typeof prevRepMap[o.oracle_id] === "number" ? prevRepMap[o.oracle_id] : o.reputation);
    const delta = typeof o.reputation === "number" && typeof oldRep === "number"
      ? +(o.reputation - oldRep).toFixed(3)
      : 0;
    return {
      ...o,
      old_reputation: oldRep,
      delta_reputation: o.delta_reputation ?? delta,
      profile: o.profile || (o.status === "ALERT" ? "ALERT" : "NORMAL"),
    };
  });

  let errors = raw.errors;
  if (!errors && typeof raw.ground_truth === "number" && raw.methods) {
    const gt = raw.ground_truth;
    errors = {
      mean:     typeof raw.methods.mean     === "number" ? +Math.abs(raw.methods.mean - gt).toFixed(4) : null,
      median:   typeof raw.methods.median   === "number" ? +Math.abs(raw.methods.median - gt).toFixed(4) : null,
      trimmed:  typeof raw.methods.trimmed  === "number" ? +Math.abs(raw.methods.trimmed - gt).toFixed(4) : null,
      weighted: typeof raw.methods.weighted === "number" ? +Math.abs(raw.methods.weighted - gt).toFixed(4) : null,
      ai:       typeof raw.methods.ai       === "number"
        ? +Math.abs(raw.methods.ai - gt).toFixed(4)
        : (typeof raw.final_value === "number" ? +Math.abs(raw.final_value - gt).toFixed(4) : null),
    };
  }

  let confidenceFormula = raw.confidence_formula;
  if (!confidenceFormula && raw.breakdown) {
    const b = raw.breakdown;
    const agr = ((b.agreement ?? 0) * 100).toFixed(1);
    const rep = ((b.reputation ?? 0) * 100).toFixed(1);
    const cov = ((b.coverage ?? 0) * 100).toFixed(0);
    const quo = ((b.quorum ?? 0) * 100).toFixed(0);
    confidenceFormula =
      `Confidence = Accord (${agr}%)^0.30 × Réputation (${rep}%)^0.25 × Couverture (${cov}%)^0.20 × Quorum (${quo}%) = ${(raw.confidence * 100).toFixed(1)}%`;
  }

  return {
    ...raw,
    _isReal: true,
    per_oracle: perOracle,
    errors: errors || {},
    confidence_formula: confidenceFormula,
    blockchain: {
      ...(raw.blockchain || {}),
      is_real: true,
    },
  };
}

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

  // Références internes pour éviter les closures obsolètes et appels concurrents
  const engineRef = useRef(null);
  const lastFetchedIdRef = useRef(0);
  const historyRef = useRef([]);
  const isFetchingRef = useRef(false);

  const pushRealRound = useCallback((raw) => {
    const prev = historyRef.current[historyRef.current.length - 1] || null;
    const normalized = normalizeRealRound(raw, prev);
    if (!normalized) return;
    lastFetchedIdRef.current = normalized.round_id;
    const updated = [...historyRef.current, normalized];
    const sliced = updated.length > 50 ? updated.slice(updated.length - 50) : updated;
    historyRef.current = sliced;
    setCurrentRound(normalized);
    setHistory(sliced);
  }, []);

  // Chargement initial d'une fenêtre réelle (5 premiers rounds) depuis Flask
  const loadInitialRealWindow = useCallback(async (limit = 5) => {
    try {
      const res = await fetch(`${config.apiUrl}/rounds?limit=${limit}&order=asc&format=array&full=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        const normalizedList = [];
        for (const raw of list) {
          const prev = normalizedList[normalizedList.length - 1] || null;
          normalizedList.push(normalizeRealRound(raw, prev));
        }
        historyRef.current = normalizedList;
        const last = normalizedList[normalizedList.length - 1];
        lastFetchedIdRef.current = last.round_id;
        setCurrentRound(last);
        setHistory(normalizedList);
      }
      setBackendError(null);
    } catch (err) {
      setBackendError(`Backend injoignable (${err.message}) — Vérifiez que le service Flask est démarré.`);
    }
  }, []);

  // Avance d'un round réel (lecture séquentielle puis écoute des nouveaux rounds)
  const advanceRealRound = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const nextId = lastFetchedIdRef.current + 1;
      const res = await fetch(`${config.apiUrl}/rounds/${nextId}`);
      if (res.ok) {
        const raw = await res.json();
        pushRealRound(raw);
        setBackendError(null);
        return;
      }

      if (res.status === 404) {
        // Fin des rounds séquentiels atteinte : vérifier si un round plus récent (> lastFetchedIdRef) existe
        const latestRes = await fetch(`${config.apiUrl}/rounds?limit=1&order=desc`);
        if (!latestRes.ok) throw new Error(`HTTP ${latestRes.status}`);
        const data = await latestRes.json();
        const list = Array.isArray(data) ? data : (data.rounds || []);
        if (list.length > 0 && list[0].round_id > lastFetchedIdRef.current) {
          const detailRes = await fetch(`${config.apiUrl}/rounds/${list[0].round_id}`);
          const full = detailRes.ok ? await detailRes.json() : list[0];
          pushRealRound(full);
        }
        setBackendError(null);
        return;
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setBackendError(`Backend injoignable (${err.message}) — Vérifiez que le service Flask est démarré.`);
    } finally {
      isFetchingRef.current = false;
    }
  }, [pushRealRound]);

  // Initialisation selon le mode (Mock vs Réel)
  useEffect(() => {
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
      historyRef.current = [first];
      setCurrentRound(first);
      setHistory([first]);
      setBackendError(null);
    } else {
      historyRef.current = [];
      lastFetchedIdRef.current = 0;
      loadInitialRealWindow(5);
    }
  }, [isMockMode, loadInitialRealWindow]);

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

    const interval = setInterval(() => {
      if (isMockMode) {
        if (engineRef.current) {
          const next = engineRef.current.computeNextRound();
          setCurrentRound(next);
          setHistory((prev) => {
            const updated = [...prev, next];
            const sliced = updated.length > 50 ? updated.slice(updated.length - 50) : updated;
            historyRef.current = sliced;
            return sliced;
          });
        }
      } else {
        advanceRealRound();
      }
    }, speed);

    return () => clearInterval(interval);
  }, [isPlaying, speed, isMockMode, advanceRealRound]);

  // Avancement pas à pas (Step) — fonctionne en mode Mock ET Réel
  function handleStep() {
    if (isMockMode) {
      if (engineRef.current) {
        const next = engineRef.current.computeNextRound();
        setCurrentRound(next);
        setHistory((prev) => {
          const updated = [...prev, next];
          const sliced = updated.length > 50 ? updated.slice(updated.length - 50) : updated;
          historyRef.current = sliced;
          return sliced;
        });
      }
    } else {
      advanceRealRound();
    }
  }

  // Réinitialisation du flux
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
      historyRef.current = [first];
      setCurrentRound(first);
      setHistory([first]);
    } else {
      historyRef.current = [];
      lastFetchedIdRef.current = 0;
      loadInitialRealWindow(1);
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
            <strong>Mode Réel connecté (VITE_USE_MOCKS=false) :</strong> flux alimenté par le backend Flask et le modèle Isolation Forest de Personne B (Round #{currentRound?.round_id ?? "—"}).
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
