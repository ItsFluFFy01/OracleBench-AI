import React from "react";
import { Play, Pause, SkipForward, RotateCcw, Settings2 } from "lucide-react";

export function LiveControls({
  isPlaying,
  onTogglePlay,
  onStep,
  onReset,
  speed,
  onChangeSpeed,
  oracleCount,
  onChangeOracleCount,
  maliciousPct,
  onChangeMaliciousPct,
  attackType,
  onChangeAttackType,
  seed,
  onChangeSeed,
  isMockMode,
}) {
  return (
    <div className="chart-card live-controls-card">
      <div className="live-controls-row">
        {/* Actions principales */}
        <div className="live-btn-group">
          <button
            className={`btn ${isPlaying ? "btn-secondary" : "btn-primary"}`}
            onClick={onTogglePlay}
            title={isPlaying ? "Mettre en pause" : "Démarrer le flux Live"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            <span>{isPlaying ? "Pause" : "Lecture"}</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={onStep}
            disabled={isPlaying}
            title="Avancer d'un round (Pas à pas)"
          >
            <SkipForward size={16} />
            <span>Pas à pas</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={onReset}
            title="Réinitialiser la simulation"
          >
            <RotateCcw size={16} />
            <span>Réinitialiser</span>
          </button>
        </div>

        {/* Vitesse */}
        <div className="live-control-item">
          <span className="live-control-label">Cadence :</span>
          <select
            className="round-select"
            value={speed}
            onChange={(e) => onChangeSpeed(Number(e.target.value))}
          >
            <option value={500}>0.5 s / round (Rapide)</option>
            <option value={1000}>1.0 s / round (Standard)</option>
            <option value={2000}>2.0 s / round (Analytique)</option>
            <option value={3000}>3.0 s / round (Lenteur démo)</option>
          </select>
        </div>
      </div>

      {/* Paramètres de simulation (actifs en mode Mock/Simulation) */}
      {isMockMode && (
        <div className="live-params-grid">
          <div className="live-control-item">
            <span className="live-control-label">
              <Settings2 size={13} style={{ display: "inline", marginRight: 4 }} />
              Nœuds Oracles :
            </span>
            <select
              className="round-select"
              value={oracleCount}
              onChange={(e) => onChangeOracleCount(Number(e.target.value))}
            >
              <option value={5}>5 Nœuds</option>
              <option value={10}>10 Nœuds</option>
              <option value={20}>20 Nœuds</option>
            </select>
          </div>

          <div className="live-control-item">
            <span className="live-control-label">% Malveillants :</span>
            <select
              className="round-select"
              value={maliciousPct}
              onChange={(e) => onChangeMaliciousPct(Number(e.target.value))}
            >
              <option value={0}>0% (Idéal)</option>
              <option value={10}>10% (Faible)</option>
              <option value={20}>20% (Modéré)</option>
              <option value={35}>35% (Élevé)</option>
              <option value={50}>50% (Critique / Byzance)</option>
            </select>
          </div>

          <div className="live-control-item">
            <span className="live-control-label">Attaque simulée :</span>
            <select
              className="round-select"
              value={attackType}
              onChange={(e) => onChangeAttackType(e.target.value)}
            >
              <option value="bias">Biais constant (±18)</option>
              <option value="spike">Spikes extrêmes (±100)</option>
              <option value="stale">Stale (Valeurs figées)</option>
              <option value="collusion">Collusion coordonnée</option>
            </select>
          </div>

          <div className="live-control-item">
            <span className="live-control-label">Seed (reproductibilité) :</span>
            <input
              type="number"
              className="round-select"
              style={{ width: "90px" }}
              value={seed}
              onChange={(e) => onChangeSeed(Number(e.target.value) || 42)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
