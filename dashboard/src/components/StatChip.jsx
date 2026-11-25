import React from "react";

/**
 * Petite carte statistique avec badge de variation.
 * badgeType: "up" | "down" | "neu" | "ok" | "err" | "warn"
 */
export function StatChip({ label, value, unit = "", sub, badge, badgeType = "neu", icon: Icon }) {
  const badgeCls =
    badgeType === "up"   ? "stat-badge stat-badge-up"   :
    badgeType === "down" ? "stat-badge stat-badge-down" :
    badgeType === "ok"   ? "stat-badge stat-badge-ok"   :
    badgeType === "err"  ? "stat-badge stat-badge-err"  :
    badgeType === "warn" ? "stat-badge stat-badge-warn" :
                           "stat-badge stat-badge-neu";

  return (
    <div className="stat-chip">
      <div className="stat-chip-top">
        {Icon && (
          <span className="stat-chip-icon">
            <Icon size={16} />
          </span>
        )}
        <span className="stat-chip-label">{label}</span>
        {badge != null && <span className={badgeCls}>{badge}</span>}
      </div>
      <div className="stat-chip-value">
        {value}
        {unit && <span className="stat-chip-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-chip-sub">{sub}</div>}
    </div>
  );
}
