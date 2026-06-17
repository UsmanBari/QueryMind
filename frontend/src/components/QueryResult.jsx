import React, { useState, useEffect } from "react";
import ChartView from "./ChartView";
import DataTable from "./DataTable";

// Manual SQL Syntax Highlighter using regex rules that avoids matching inside HTML tags
function highlightSQL(sql) {
  if (!sql) return "";
  
  // Escape HTML tags to prevent XSS/rendering issues
  let escaped = sql
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Syntax highlighting rules
  const strings = /(["'])(.*?)\1/g;

  // Stash string literals to prevent nested highlighting
  const savedStrings = [];
  escaped = escaped.replace(strings, (match) => {
    const placeholder = `__STRING_PLACEHOLDER_${savedStrings.length}__`;
    savedStrings.push(match);
    return placeholder;
  });

  // Highlight keywords - ignoring anything inside html tags by matching tags first and returning them as-is
  escaped = escaped.replace(/(<[^>]+>)|(\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|JOIN|ON|AS|AND|OR|IN|SUM|AVG|COUNT|MIN|MAX|HAVING|DESC|ASC|LEFT|RIGHT|INNER|IS|NOT|NULL|LIKE)\b)/gi, (match, tag, kw) => {
    if (tag) return tag;
    return `<span style="color: #3b82f6; font-weight: 600;">${kw.toUpperCase()}</span>`;
  });

  // Highlight numbers - ignoring anything inside html tags
  escaped = escaped.replace(/(<[^>]+>)|(\b\d+(?:\.\d+)?\b)/g, (match, tag, num) => {
    if (tag) return tag;
    return `<span style="color: #f59e0b;">${num}</span>`;
  });

  // Highlight table aliases - c., o., p., oi., r. in pink #f472b6
  escaped = escaped.replace(/(<[^>]+>)|(\b(c|o|p|oi|r)\.)/gi, (match, tag, aliasWithDot, alias) => {
    if (tag) return tag;
    return `<span style="color: #f472b6; font-weight: 600;">${alias.toLowerCase()}</span>.`;
  });

  // Restore string literals
  savedStrings.forEach((str, idx) => {
    escaped = escaped.replace(`__STRING_PLACEHOLDER_${idx}__`, `<span style="color: #10b981;">${str}</span>`);
  });

  return escaped;

}

export default function QueryResult({ result }) {
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("chart"); // chart | table
  const [relativeTime, setRelativeTime] = useState("just now");

  // Update relative timestamp periodic updates
  useEffect(() => {
    if (!result.timestamp) return;

    const updateTime = () => {
      const elapsedMs = new Date() - new Date(result.timestamp);
      const elapsedMins = Math.floor(elapsedMs / 60000);
      if (elapsedMins < 1) {
        setRelativeTime("just now");
      } else if (elapsedMins === 1) {
        setRelativeTime("1 min ago");
      } else {
        setRelativeTime(`${elapsedMins} min ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 30000); // update every 30s
    return () => clearInterval(interval);
  }, [result.timestamp]);

  const handleCopySQL = () => {
    if (!result.sql) return;
    navigator.clipboard.writeText(result.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExportCSV = () => {
    if (!result.results || !result.results.columns || !result.results.rows) return;

    const cols = result.results.columns;
    const rows = result.results.rows;

    // Build CSV content
    const headerRow = cols.map(c => '"' + c.replace(/"/g, '""') + '"').join(",");
    const dataRows = rows.map(row => 
      row.map(val => {
        if (val === null || val === undefined) return '""';
        return '"' + String(val).replace(/"/g, '""') + '"';
      }).join(",")
    );

    const csvContent = [headerRow, ...dataRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    // File name: "{db_name}_{question_first_4_words}.csv"
    const words = result.question
      .split(/\s+/)
      .slice(0, 4)
      .join("_")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, ""); // Clean filename
    
    const filename = `${result.db_name || "dataset"}_${words || "export"}.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="output-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* a. Question Header */}
      <div 
        style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "flex-start", 
          borderBottom: "1px solid var(--border-color)", 
          paddingBottom: "12px" 
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
          <span style={{ color: result.mode === "schema" ? "#8b5cf6" : "var(--primary-color)", fontWeight: "bold", fontSize: "1.1rem" }}>Q:</span>
          <span style={{ fontSize: "1rem", fontWeight: 600 }}>{result.question}</span>
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {relativeTime}
        </span>
      </div>

      {/* Tables Joined Banner (Schema Mode Flow) */}
      {result.mode === "schema" && result.tables_used && result.tables_used.length > 0 && (
        <div 
          style={{
            backgroundColor: "#1a1025",
            border: "1px solid rgba(139, 92, 246, 0.2)",
            borderRadius: "8px",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginTop: "-6px"
          }}
        >
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", marginRight: "4px" }}>
            🔗 Tables Joined:
          </span>
          {result.tables_used.map((tbl, idx) => (
            <React.Fragment key={tbl}>
              <span 
                style={{
                  backgroundColor: "#2d1b69",
                  border: "1px solid #8b5cf6",
                  color: "#f9fafb",
                  borderRadius: "100px",
                  padding: "2px 10px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  textTransform: "lowercase"
                }}
              >
                {tbl}
              </span>
              {idx < result.tables_used.length - 1 && (
                <span style={{ color: "#8b5cf6", fontSize: "0.75rem", fontWeight: "bold" }}>
                  &rarr;
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* b. SQL block */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <button
          className="btn-secondary"
          onClick={() => setSqlExpanded(!sqlExpanded)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 12px",
            fontSize: "0.8rem",
            width: "100%",
            textAlign: "left"
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            Generated SQL
          </span>
          <span>{sqlExpanded ? "▲ Hide" : "▼ Show"}</span>
        </button>

        {sqlExpanded && (
          <div style={{ position: "relative", marginTop: "4px" }}>
            {/* Copy Button */}
            <button
              onClick={handleCopySQL}
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                backgroundColor: "#161616",
                border: "1px solid var(--border-color)",
                color: copied ? "var(--success-color)" : "var(--text-secondary)",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "0.7rem",
                cursor: "pointer",
                fontWeight: "600",
                transition: "all 0.2s"
              }}
            >
              {copied ? "Copied!" : "Copy SQL"}
            </button>
            <pre 
              className="code-block"
              style={{ backgroundColor: "#0a0a0a", margin: 0, paddingRight: "80px" }}
              dangerouslySetInnerHTML={{ __html: highlightSQL(result.sql) }}
            />
          </div>
        )}

        {/* Retry Warnings */}
        {result.retries > 0 && (
          <span style={{ fontSize: "0.75rem", color: "var(--warning-color)", fontWeight: "500", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
            ⚠️ Required {result.retries} retries to generate valid SQL.
          </span>
        )}
      </div>

      {/* c. Insight Box */}
      {result.insight && (
        <div 
          style={{
            backgroundColor: "#1e2a3a",
            borderLeft: "3px solid var(--primary-color)",
            borderRadius: "0 6px 6px 0",
            padding: "12px 16px",
            fontSize: "0.9rem",
            lineHeight: "1.5"
          }}
        >
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", color: "#60a5fa" }}>
            <span>💡</span> Insight
          </div>
          <p style={{ color: "var(--text-primary)" }}>{result.insight}</p>
        </div>
      )}

      {/* d. Results Tabs */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="view-switch-tabs" style={{ alignSelf: "flex-start" }}>
          <button 
            className={`view-tab ${activeTab === "chart" ? "active" : ""}`}
            onClick={() => setActiveTab("chart")}
          >
            📊 Chart
          </button>
          <button 
            className={`view-tab ${activeTab === "table" ? "active" : ""}`}
            onClick={() => setActiveTab("table")}
          >
            📋 Table
          </button>
        </div>

        {/* Dynamic content rendering based on activeTab */}
        <div style={{ minHeight: "220px" }}>
          {activeTab === "chart" ? (
            <ChartView result={result} />
          ) : (
            <DataTable columns={result.results.columns} rows={result.results.rows} maxHeight="300px" />
          )}
        </div>
      </div>

      {/* g. Footer statistics & Export */}
      <div 
        style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          marginTop: "8px",
          paddingTop: "12px", 
          borderTop: "1px solid var(--border-color)",
          fontSize: "0.8rem", 
          color: "var(--text-secondary)" 
        }}
      >
        <div style={{ display: "flex", gap: "12px" }}>
          <span>{result.results.row_count} rows returned</span>
          <span style={{ color: "var(--border-color)" }}>|</span>
          <span>Executed in {result.results.execution_time_ms}ms</span>
        </div>

        <button 
          className="btn-secondary" 
          onClick={handleExportCSV}
          style={{ padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export CSV
        </button>
      </div>
    </div>
  );
}
