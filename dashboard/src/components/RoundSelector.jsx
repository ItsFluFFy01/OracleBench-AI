import React from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

export function RoundSelector({ currentRoundId, totalRounds, onSelectRound, onRefresh }) {
  return (
    <div className="control-bar">
      <div className="round-selector-group">
        <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontWeight: 500 }}>
          Sélection du Round :
        </span>
        <button
          className="btn btn-secondary"
          onClick={() => onSelectRound(Math.max(1, currentRoundId - 1))}
          disabled={currentRoundId <= 1}
          style={{ padding: "0.4rem 0.6rem" }}
          title="Round précédent"
        >
          <ChevronLeft size={16} />
        </button>

        <select
          className="round-select"
          value={currentRoundId}
          onChange={(e) => onSelectRound(Number(e.target.value))}
        >
          {Array.from({ length: totalRounds }, (_, i) => i + 1).map((id) => (
            <option key={id} value={id}>
              Round #{id}
            </option>
          ))}
        </select>

        <button
          className="btn btn-secondary"
          onClick={() => onSelectRound(Math.min(totalRounds, currentRoundId + 1))}
          disabled={currentRoundId >= totalRounds}
          style={{ padding: "0.4rem 0.6rem" }}
          title="Round suivant"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button className="btn btn-secondary" onClick={onRefresh} title="Actualiser les données">
          <RefreshCw size={14} />
          <span>Actualiser</span>
        </button>
      </div>
    </div>
  );
}
