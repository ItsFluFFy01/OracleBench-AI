import React, { useState } from "react";
import {
  LayoutDashboard, Users, GitCompare, Blocks, BarChart3,
  ChevronRight, Download, Menu, X,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Analyse",
    color: "var(--accent)",
    items: [
      { id: "round",      label: "Round",       icon: LayoutDashboard },
      { id: "oracles",    label: "Oracles",      icon: Users },
    ],
  },
  {
    label: "Comparaison",
    color: "var(--grad-bar-a)",
    items: [
      { id: "comparison", label: "Comparaison",  icon: GitCompare },
      { id: "blockchain", label: "Blockchain",   icon: Blocks },
    ],
  },
  {
    label: "Recherche",
    color: "var(--line-ai)",
    items: [
      { id: "experiments",label: "Expériences",  icon: BarChart3 },
    ],
  },
];

/** Génère un CSV à partir d'un tableau de rounds et déclenche le téléchargement */
function exportCsv(rounds) {
  if (!rounds || rounds.length === 0) return;
  const cols = ["round_id", "final_value", "confidence", "proof_hash"];
  const header = cols.join(",");
  const rows = rounds.map((r) =>
    cols.map((c) => (r[c] != null ? String(r[c]) : "")).join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "oraclebench_rounds.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function Sidebar({ active, onNavigate, rounds = [] }) {
  const [open, setOpen] = useState(false);

  const registered = rounds.filter((r) => r.confidence >= 0.7).length;
  const rejected    = rounds.filter((r) => r.confidence < 0.7).length;
  const pending     = rounds.length - registered - rejected;

  return (
    <>
      {/* Bouton hamburger (mobile) */}
      <button
        className="sidebar-hamburger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Overlay mobile */}
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? " open" : ""}`}>
        {/* Marque */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo" />
          <div>
            <div className="sidebar-brand-title">OracleBench-AI</div>
            <div className="sidebar-brand-sub">Benchmark Oracles</div>
          </div>
        </div>

        <div className="sidebar-scroll">
          {/* Navigation */}
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="sidebar-group">
              <div className="sidebar-group-label" style={{ color: g.color }}>
                {g.label}
              </div>
              {g.items.map(({ id, label, icon: Icon }) => {
                const isActive = active === id;
                return (
                  <button
                    key={id}
                    className={`sidebar-item${isActive ? " active" : ""}`}
                    onClick={() => { onNavigate(id); setOpen(false); }}
                  >
                    {isActive && <span className="sidebar-item-bar" />}
                    <Icon size={16} className="sidebar-item-icon" />
                    <span className="sidebar-item-label">{label}</span>
                    {isActive && <ChevronRight size={14} className="sidebar-item-arrow" />}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Statut des rounds */}
          <div className="sidebar-group">
            <div className="sidebar-group-label" style={{ color: "var(--warn-text)" }}>
              Statut des Rounds
            </div>
            <div className="sidebar-status-row">
              <span>Enregistrés</span>
              <span className="badge badge-normal sidebar-status-badge">{registered}</span>
            </div>
            <div className="sidebar-status-row">
              <span>Rejetés</span>
              <span className="badge badge-alert sidebar-status-badge">{rejected}</span>
            </div>
            <div className="sidebar-status-row">
              <span>En attente</span>
              <span className="badge badge-warn sidebar-status-badge">{pending}</span>
            </div>
          </div>
        </div>

        {/* Footer — Export CSV */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-label">Rapport Complet</div>
          <div className="sidebar-footer-desc">Exportez tous les résultats</div>
          <button className="sidebar-export-btn" onClick={() => exportCsv(rounds)}>
            <Download size={15} />
            Exporter le rapport (CSV)
          </button>
        </div>
      </aside>
    </>
  );
}
