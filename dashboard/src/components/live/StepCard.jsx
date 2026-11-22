import React from "react";

export function StepCard({ stepNumber, title, subtitle, isActive, isCompleted, children }) {
  const statusClass = isActive
    ? "step-card active"
    : isCompleted
    ? "step-card completed"
    : "step-card pending";

  return (
    <div className={statusClass}>
      <div className="step-card-header">
        <div className="step-number-pill">Étape {stepNumber}</div>
        <div className="step-title-wrap">
          <div className="step-title">{title}</div>
          {subtitle && <div className="step-subtitle">{subtitle}</div>}
        </div>
      </div>
      <div className="step-card-content">{children}</div>
    </div>
  );
}
