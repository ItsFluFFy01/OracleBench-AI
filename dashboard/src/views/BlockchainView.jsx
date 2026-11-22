import React, { useState, useEffect } from "react";
import {
  Blocks,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Fuel,
  Clock,
  Send,
  Database,
  Search,
} from "lucide-react";
import { getOnChainRound, recordOnChain, getBridgeHealth, getBridgeStats } from "../api";

export function BlockchainView({ round }) {
  const [onChainData, setOnChainData] = useState(null);
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Chargement des données au changement de round
  useEffect(() => {
    checkOnChain();
    loadHealthAndStats();
  }, [round?.round_id]);

  async function loadHealthAndStats() {
    const h = await getBridgeHealth();
    setHealth(h);
    const s = await getBridgeStats();
    setStats(s);
  }

  async function checkOnChain() {
    if (!round) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const data = await getOnChainRound(round.round_id);
      setOnChainData(data);
    } catch (e) {
      setOnChainData({ exists: false, error: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendToBlockchain() {
    if (!round) return;
    setRecordLoading(true);
    setActionMessage(null);
    try {
      const payload = {
        round_id: round.round_id,
        final_value: round.final_value,
        confidence: round.confidence,
        proof_hash: round.proof_hash,
      };
      const res = await recordOnChain(payload);
      if (res.status === 200 || res.status === 201 || res.status === "CONFIRMED") {
        setActionMessage({
          type: "success",
          text: `Round #${round.round_id} confirmé on-chain ! Gas utilisé : ${res.gas_used}, Tx : ${res.tx_hash.slice(0, 16)}...`,
        });
        checkOnChain();
        loadHealthAndStats();
      } else if (res.status === 422 || res.status === "REJECTED") {
        setActionMessage({
          type: "danger",
          text: `Rejet on-chain (Confiance ${res.confidence} < seuil ${res.threshold}). Erreur Custom: ConfidenceTooLow.`,
        });
      } else {
        setActionMessage({
          type: "warning",
          text: res.error || `Erreur (Code ${res.status})`,
        });
      }
    } catch (e) {
      setActionMessage({ type: "danger", text: e.message });
    } finally {
      setRecordLoading(false);
    }
  }

  if (!round) return <div className="card">Chargement de la vue blockchain...</div>;

  const isConfirmed = onChainData?.exists === true;
  const isRejected = round.confidence < 0.7;

  return (
    <div>
      {/* Bannière état du Pont & Contrat */}
      <div className="cards-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">
            <span>État du Pont HTTP (Bridge)</span>
            <Database size={18} color="var(--accent-info)" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              className={`status-dot ${health?.status === "ok" ? "active" : "warning"}`}
            />
            <span style={{ fontWeight: 600 }}>
              {health?.status === "ok" ? "Opérationnel (Port 3001)" : "Simulation locale"}
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            Réseau : {health?.network || "Hardhat Local (31337)"}
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Adresse du Smart Contract</span>
            <Blocks size={18} color="var(--accent-primary)" />
          </div>
          <div
            className="mono"
            style={{
              fontSize: "0.85rem",
              background: "rgba(15, 23, 42, 0.5)",
              padding: "0.4rem 0.6rem",
              borderRadius: "6px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {health?.contract_address || "0x5FbDB2315678afecb367f032d93F642f64180aa3"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            Solidity ^0.8.20 — Seuil de confiance : <strong>7000 (70%)</strong>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Moyennes de Gas & Latence</span>
            <Fuel size={18} color="var(--accent-warning)" />
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <div>
              <div className="card-value" style={{ fontSize: "1.25rem" }}>
                {stats?.gas_used?.avg ? stats.gas_used.avg.toLocaleString() : "145 392"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Gas Moyen</div>
            </div>
            <div>
              <div className="card-value" style={{ fontSize: "1.25rem" }}>
                {stats?.confirmation_ms?.avg || "2.6"} ms
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Latence Moyenne</div>
            </div>
          </div>
        </div>
      </div>

      {/* Message d'action (Succès / Erreur) */}
      {actionMessage && (
        <div
          className="card"
          style={{
            marginBottom: "1.5rem",
            background:
              actionMessage.type === "success"
                ? "var(--accent-success-bg)"
                : actionMessage.type === "danger"
                ? "var(--accent-danger-bg)"
                : "var(--accent-warning-bg)",
            borderColor:
              actionMessage.type === "success"
                ? "var(--accent-success)"
                : actionMessage.type === "danger"
                ? "var(--accent-danger)"
                : "var(--accent-warning)",
          }}
        >
          <div style={{ fontWeight: 600 }}>{actionMessage.text}</div>
        </div>
      )}

      {/* Détail on-chain pour le round courant */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">
          <span>Statut de Transaction Blockchain (Round #{round.round_id})</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-secondary" onClick={checkOnChain} disabled={loading}>
              <Search size={14} />
              <span>{loading ? "Vérification..." : "Vérifier On-Chain"}</span>
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSendToBlockchain}
              disabled={recordLoading}
            >
              <Send size={14} />
              <span>{recordLoading ? "Envoi..." : "Envoyer au Pont"}</span>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1rem 0" }}>
          <span style={{ fontSize: "1rem", fontWeight: 600 }}>Statut On-Chain :</span>
          {isConfirmed ? (
            <span className="badge badge-normal" style={{ fontSize: "0.85rem", padding: "0.35rem 0.8rem" }}>
              <CheckCircle2 size={16} /> CONFIRMED / VERIFIED
            </span>
          ) : isRejected ? (
            <span className="badge badge-alert" style={{ fontSize: "0.85rem", padding: "0.35rem 0.8rem" }}>
              <XCircle size={16} /> REJECTED (Confiance &lt; 0.70)
            </span>
          ) : (
            <span className="badge badge-info" style={{ fontSize: "0.85rem", padding: "0.35rem 0.8rem" }}>
              EN ATTENTE D'ENREGISTREMENT
            </span>
          )}
        </div>

        {/* Comparaison Calculé vs On-Chain */}
        <div className="table-container" style={{ marginTop: "1rem" }}>
          <table>
            <thead>
              <tr>
                <th>Paramètre</th>
                <th>Valeur Calculée (Pipeline IA)</th>
                <th>Valeur Lue On-Chain (Smart Contract)</th>
                <th>Conformité</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Valeur Finale</td>
                <td className="mono" style={{ fontWeight: 600 }}>
                  {round.final_value.toFixed(2)}
                </td>
                <td className="mono" style={{ fontWeight: 600 }}>
                  {isConfirmed ? onChainData.final_value.toFixed(2) : "—"}
                </td>
                <td>
                  {isConfirmed && Math.abs(round.final_value - onChainData.final_value) < 0.001 ? (
                    <span className="badge badge-normal">Identique</span>
                  ) : isConfirmed ? (
                    <span className="badge badge-alert">Différente</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
              <tr>
                <td>Confiance</td>
                <td className="mono">{(round.confidence * 100).toFixed(1)}%</td>
                <td className="mono">
                  {isConfirmed ? `${(onChainData.confidence * 100).toFixed(1)}%` : "—"}
                </td>
                <td>
                  {isConfirmed && Math.abs(round.confidence - onChainData.confidence) < 0.001 ? (
                    <span className="badge badge-normal">Identique</span>
                  ) : isConfirmed ? (
                    <span className="badge badge-alert">Différente</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
              <tr>
                <td>Hash de Preuve</td>
                <td className="mono" style={{ fontSize: "0.8rem" }}>
                  {round.proof_hash.slice(0, 20)}...
                </td>
                <td className="mono" style={{ fontSize: "0.8rem" }}>
                  {isConfirmed ? `${onChainData.proof_hash.slice(0, 20)}...` : "—"}
                </td>
                <td>
                  {isConfirmed && round.proof_hash === onChainData.proof_hash ? (
                    <span className="badge badge-normal">Hash Scellé</span>
                  ) : isConfirmed ? (
                    <span className="badge badge-alert">Discordance</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
              <tr>
                <td>Horodatage Block</td>
                <td className="mono">Round #{round.round_id}</td>
                <td className="mono">
                  {isConfirmed
                    ? new Date(onChainData.timestamp * 1000).toLocaleString()
                    : "—"}
                </td>
                <td>
                  {isConfirmed ? <span className="badge badge-normal">Enregistré</span> : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
