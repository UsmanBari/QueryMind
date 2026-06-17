import React from "react";

export default function LoadingResult({ question, themeColor = "var(--primary-color)" }) {
  return (
    <div className="output-card shimmer-card" style={{ opacity: 0.85 }}>
      {/* Question Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
        <span style={{ color: themeColor, fontWeight: "bold", fontSize: "1.1rem" }}>Q:</span>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexGrow: 1 }}>
          <span style={{ fontSize: "1rem", fontWeight: 600 }}>{question}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Running query pipeline...</span>
        </div>
      </div>

      {/* SQL block skeleton */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
        <div className="shimmer" style={{ height: "16px", width: "120px", borderRadius: "4px" }}></div>
        <div className="shimmer" style={{ height: "60px", borderRadius: "6px" }}></div>
      </div>

      {/* Insight box skeleton */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
        <div className="shimmer" style={{ height: "16px", width: "80px", borderRadius: "4px" }}></div>
        <div className="shimmer" style={{ height: "50px", borderRadius: "6px", backgroundColor: "rgba(30, 42, 58, 0.5)", borderLeft: `3px solid ${themeColor}` }}></div>
      </div>

      {/* Chart tab content area skeleton */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <div className="shimmer" style={{ height: "28px", width: "80px", borderRadius: "4px" }}></div>
          <div className="shimmer" style={{ height: "28px", width: "80px", borderRadius: "4px" }}></div>
        </div>
        <div className="shimmer" style={{ height: "180px", borderRadius: "6px" }}></div>
      </div>

      {/* Status Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border-color)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
        <span>🤔 Generating SQL and running query...</span>
        <div className="shimmer" style={{ height: "14px", width: "120px", borderRadius: "4px" }}></div>
      </div>
    </div>
  );
}

