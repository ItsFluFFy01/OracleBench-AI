import React from "react";
import { LayoutDashboard, Users, GitCompare, Blocks, BarChart3, Radio } from "lucide-react";
import { config } from "../config";

export function Navbar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "round", label: "Vue Round", icon: LayoutDashboard },
    { id: "oracles", label: "Oracles", icon: Users },
    { id: "comparison", label: "Comparaison", icon: GitCompare },
    { id: "blockchain", label: "Blockchain", icon: Blocks },
    { id: "experiments", label: "Expériences", icon: BarChart3 },
  ];

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-wrapper">
          <div className="brand-logo">
            <Radio size={20} />
          </div>
          <div>
            <h1 className="brand-title">OracleBench-AI</h1>
            <p className="brand-subtitle">Benchmark & Consensus d'Oracles Blockchain</p>
          </div>
        </div>

        <nav className="nav-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`nav-tab ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="header-status-badge">
          <span className={`status-dot ${config.useMocks ? "warning" : "active"}`} />
          <span className="mono">
            {config.useMocks ? "Mode Mocks (Autonome)" : "Connecté (API Flask & Pont)"}
          </span>
        </div>
      </div>
    </header>
  );
}
