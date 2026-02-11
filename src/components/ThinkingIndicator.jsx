import React from "react";

export default function ThinkingIndicator({ elapsedLabel, isMobile = false }) {
  return (
    <div className={`thinking-shell ${isMobile ? "thinking-shell-mobile" : ""}`}>
      <div className="thinking-top">
        <div className="thinking-orb-wrap" aria-hidden="true">
          <div className="thinking-orb" />
          <div className="thinking-orb-glow" />
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="thinking-title">NSBOT is thinking</div>
          <div className="thinking-time">Elapsed {elapsedLabel}</div>
        </div>
      </div>

      <div className="thinking-wave" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
