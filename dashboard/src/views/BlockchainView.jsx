import React, { useState, useEffect } from "react";
import { Blocks, CheckCircle2, XCircle, Fuel, Clock, Send, Database, Search } from "lucide-react";
import { getOnChainRound, recordOnChain, getBridgeHealth, getBridgeStats } from "../api";
import { KpiCard }  from "../components/KpiCard";
import { StatChip } from "../components/StatChip";
import { AreaCard } from "../components/AreaCard";

export function BlockchainView({ round }) {
  const [onChainData,  setOnChainData]  = useState(null);
  const [health,       setHealth]       = useState(null);
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [recLoading,   setRecLoading]   = useState(false);
  const [actionMsg,    setActionMsg]    = useState(null);

  useEffect(() => { checkOnChain(); loadHealthAndStats(); }, [round?.round_id]);

  async function loadHealthAndStats() {
    const [h, s] = await Promise.all([getBridgeHealth(), getBridgeStats()]);
    setHealth(h);
    setStats(s);
  }

  async function checkOnChain() {
    if (!round) return;
    setLoading(true);
    setActionMsg(null);
    try {
      setOnChainData(await getOnChainRound(round.round_id));
    } catch (e) {
      setOnChainData({ exists: false, error: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleRecord() {
    if (!round) return;
    setRecLoading(true);
    setActionMsg(null);
    try {
      const res = await recordOnChain({
        round_id:    round.round_id,
        final_value: round.final_value,
        confidence:  round.confidence,
        proof_hash:  round.proof_hash,
      });
      if ([200, 201, "CONFIRMED"].includes(res.status)) {
        setActionMsg({ type: "ok", text: `Round #${round.round_id} confirmé on-chain ! Gas : ${res.gas_used}  Tx : ${res.tx_hash?.slice(0, 18)}...` });
        checkOnChain(); loadHealthAndStats();
      } else if ([422, "REJECTED"].includes(res.status)) {
        setActionMsg({ type: "err", text: `Rejeté on-chain (Confiance ${res.confidence} < seuil ${res.threshold}). Erreur : ConfidenceTooLow.` });
      } else {
        setActionMsg({ type: "warn", text: res.error || `Erreur (${res.status})` });
      }
    } catch (e) {
      setActionMsg({ type: "err", text: e.message });
    } finally {
      setRecLoading(false);
    }
  }

  if (!round) return <div className="chart-card"><p className="chart-desc">Chargement blockchain...</p></div>;

  const isConfirmed = onChainData?.exists === true;
  const isRejected  = round.confidence < 0.7;

  const gasHistory = (stats?.history || []).slice(-20).map((h) => ({
    name:  `R${h.round_id}`,
    value: h.gas_used,
  }));

  const params = [
    { label: "Valeur Finale",    calc: round.final_value.toFixed(2),                on: isConfirmed ? onChainData.final_value?.toFixed(2) : "—",   match: isConfirmed && Math.abs(round.final_value - onChainData.final_value) < 0.001 },
    { label: "Confiance",        calc: `${(round.confidence*100).toFixed(1)}%`,    on: isConfirmed ? `${(onChainData.confidence*100).toFixed(1)}%` : "—", match: isConfirmed && Math.abs(round.confidence - onChainData.confidence) < 0.001 },
    { label: "Hash de Preuve",   calc: `${round.proof_hash.slice(0,20)}…`,         on: isConfirmed ? `${onChainData.proof_hash?.slice(0,20)}…` : "—", match: isConfirmed && round.proof_hash === onChainData.proof_hash },
    { label: "Horodatage Block", calc: `Round #${round.round_id}`,                 on: isConfirmed ? new Date(onChainData.timestamp*1000).toLocaleString() : "—", match: isConfirmed },
  ];

  return (
    <div className="view-grid">
      {/* ── Ligne 1 : KPI + StatChips ── */}
      <div className="kpi-row">
        <KpiCard
          variant={2}
          label="Gas Moyen (Smart Contract)"
          value={stats?.gas_used?.avg ? stats.gas_used.avg.toLocaleString() : "145 392"}
          sub={`Min: ${stats?.gas_used?.min ?? 145040}  Max: ${stats?.gas_used?.max ?? 162152}`}
        />
        <KpiCard
          variant={1}
          label="Latence Confirmation"
          value={stats?.confirmation_ms?.avg ?? 2.6}
          unit=" ms"
          sub="Réseau Hardhat local (31337)"
        />
        <StatChip
          label="Contrat Solidity"
          value="Déployé"
          icon={Blocks}
          badge="^0.8.20"
          badgeType="ok"
          sub={(health?.contract_address || "0x5FbDB…").slice(0, 20) + "…"}
        />
        <StatChip
          label="Réseau"
          value={health?.status === "ok" ? "Opérationnel" : "Simulation"}
          icon={Database}
          badge={health?.status === "ok" ? "online" : "offline"}
          badgeType={health?.status === "ok" ? "ok" : "warn"}
          sub={health?.network || "Hardhat (31337)"}
        />
      </div>

      {/* ── Message d'action ── */}
      {actionMsg && (
        <div className={`action-banner action-banner-${actionMsg.type}`}>
          {actionMsg.text}
        </div>
      )}

      {/* ── Graphique gas ── */}
      <AreaCard
        title="Gas Utilisé par Round (20 derniers)"
        desc="Coût on-chain de chaque enregistrement via le Smart Contract"
        data={gasHistory}
        dataKey="value"
        name="Gas"
        color="var(--grad-bar-a)"
        height={200}
      />

      {/* ── Vérification / envoi ── */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Données On-Chain — Round #{round.round_id}</h3>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-secondary btn-sm" onClick={checkOnChain} disabled={loading}>
              <Search size={14} />
              <span>{loading ? "Vérification…" : "Vérifier"}</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleRecord} disabled={recLoading}>
              <Send size={14} />
              <span>{recLoading ? "Envoi…" : "Envoyer au Pont"}</span>
            </button>
          </div>
        </div>

        {/* Badge statut */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1rem 0 0.5rem" }}>
          <span style={{ fontWeight: 600 }}>Statut On-Chain :</span>
          {isConfirmed
            ? <span className="badge badge-normal"><CheckCircle2 size={14} /> CONFIRMED</span>
            : isRejected
            ? <span className="badge badge-alert"><XCircle size={14} /> REJECTED (Confiance &lt; 0.70)</span>
            : <span className="badge badge-info">EN ATTENTE D'ENREGISTREMENT</span>
          }
        </div>

        {/* Tableau params */}
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Paramètre</th>
                <th>Calculé (Pipeline IA)</th>
                <th>Valeur On-Chain</th>
                <th>Conformité</th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{p.calc}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{p.on}</td>
                  <td>
                    {p.on === "—" ? "—" : p.match
                      ? <span className="badge badge-normal">Identique</span>
                      : <span className="badge badge-alert">Discordance</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
