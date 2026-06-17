import React, { useState, useEffect, useRef } from "react";
import QueryInput from "./QueryInput";
import QueryResult from "./QueryResult";
import LoadingResult from "./LoadingResult";
import { queryDataset, getSuggestions } from "../api";

export default function QueryView({ selectedDataset, schema, onQuerySuccess, activeQuestion, addToast }) {
  const [queryHistory, setQueryHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Dynamic suggestions states
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const historyEndRef = useRef(null);

  // 1. Clear history & Fetch suggestions when selected dataset changes
  useEffect(() => {
    setQueryHistory([]);
    setError(null);
    setLoading(false);
    setSuggestions([]);

    const fetchSuggestions = async () => {
      setSuggestionsLoading(true);
      try {
        console.log("[QueryView] Loading suggestions for database:", selectedDataset.db_name);
        const res = await getSuggestions(selectedDataset.db_name);
        setSuggestions(res.suggestions || []);
      } catch (err) {
        console.error("[QueryView] Failed to fetch dynamic suggestions:", err);
      } finally {
        setSuggestionsLoading(false);
      }
    };

    if (selectedDataset) {
      fetchSuggestions();
    }
  }, [selectedDataset]);

  // 2. Scroll to bottom when history grows
  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [queryHistory]);

  // 3. Register global keyboard shortcut Ctrl+K to focus query input from anywhere
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const inputEl = document.querySelector(".query-input");
        if (inputEl) {
          inputEl.focus();
          inputEl.select(); // Highlight any existing text inside
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // 4. Trigger query from external prop (like sidebar recent queries)
  useEffect(() => {
    if (activeQuestion && activeQuestion.text && activeQuestion.timestamp) {
      handleQuerySubmit(activeQuestion.text);
    }
  }, [activeQuestion]);

  const handleQuerySubmit = async (questionText) => {
    setError(null);
    setLoading(true);

    const pendingId = "pending_" + Date.now();
    const pendingEntry = {
      id: pendingId,
      question: questionText,
      timestamp: new Date(),
      isPending: true
    };

    setQueryHistory((prev) => [...prev, pendingEntry]);

    try {
      console.log(`[QueryView] Executing query: '${questionText}' on '${selectedDataset.db_name}'`);
      const res = await queryDataset(questionText, selectedDataset.db_name);
      
      // Update entry with real execution results
      setQueryHistory((prev) =>
        prev.map((item) =>
          item.id === pendingId
            ? { ...res, id: pendingId, timestamp: pendingEntry.timestamp }
            : item
        )
      );
      setLoading(false);
      addToast("Query completed", "success");
      if (onQuerySuccess) {
        onQuerySuccess();
      }
    } catch (err) {
      console.error("[QueryView] Query pipeline error:", err);
      setError(err.message || "Failed to execute query.");
      setLoading(false);
      addToast("Query failed: " + err.message, "error");
      // Remove loading block
      setQueryHistory((prev) => prev.filter((item) => item.id !== pendingId));
    }
  };

  const getLastQuestion = () => {
    if (queryHistory.length === 0) return null;
    // Get last non-pending query question
    const completedQueries = queryHistory.filter(h => !h.isPending);
    if (completedQueries.length === 0) return null;
    return completedQueries[completedQueries.length - 1].question;
  };


  const colCount = selectedDataset.columns ? selectedDataset.columns.length : 0;

  return (
    <div 
      style={{ 
        display: "flex", 
        flexDirection: "column", 
        height: "calc(100vh - 120px)", 
        margin: "-32px", 
        overflow: "hidden" 
      }}
    >
      {/* 1. Dataset Context Bar (40px) */}
      <div 
        style={{ 
          height: "40px", 
          minHeight: "40px", 
          backgroundColor: "var(--surface-color)", 
          borderBottom: "1px solid var(--border-color)", 
          display: "flex", 
          alignItems: "center", 
          padding: "0 20px", 
          fontSize: "0.8rem", 
          color: "var(--text-secondary)",
          fontWeight: "500"
        }}
      >
        <span>Querying:</span>
        <strong style={{ color: "var(--text-primary)", marginLeft: "4px" }}>
          {selectedDataset.display_name}
        </strong>
        <span style={{ margin: "0 8px", color: "var(--border-color)" }}>•</span>
        <span>{selectedDataset.row_count.toLocaleString()} rows</span>
        <span style={{ margin: "0 8px", color: "var(--border-color)" }}>•</span>
        <span>{colCount} columns</span>
      </div>

      {/* 2. Query History Area (flex-grow, scrollable) */}
      <div 
        style={{ 
          flexGrow: 1, 
          overflowY: "auto", 
          padding: "24px", 
          display: "flex", 
          flexDirection: "column", 
          gap: "24px",
          backgroundColor: "var(--bg-color)"
        }}
      >
        {queryHistory.length === 0 ? (
          <div 
            style={{ 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              justifyContent: "center", 
              flexGrow: 1, 
              color: "var(--text-muted)", 
              fontSize: "0.9rem",
              gap: "8px",
              padding: "40px"
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Ask a question below to begin your analysis.</span>
            <span style={{ fontSize: "0.8rem", opacity: 0.8 }}>Questions are converted to SQL in real-time.</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              Shortcut: press <kbd style={{ fontFamily: "var(--font-mono)", background: "var(--surface-color)", padding: "2px 4px", borderRadius: "3px" }}>Ctrl+K</kbd> to focus input.
            </span>
          </div>
        ) : (
          queryHistory.map((item) => {
            if (item.isPending) {
              return <LoadingResult key={item.id} question={item.question} />;
            }
            return <QueryResult key={item.id} result={item} />;
          })
        )}

        {/* Global Error Banner */}
        {error && (
          <div 
            className="upload-status error" 
            style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "4px", 
              borderRadius: "8px" 
            }}
          >
            <div style={{ fontWeight: "bold" }}>Query Pipeline Failed</div>
            <div>{error}</div>
          </div>
        )}

        {/* Scroll Anchor */}
        <div ref={historyEndRef} />
      </div>

      {/* 3. Query Suggestions Panel (rendered right above QueryInput) */}
      <div 
        style={{ 
          padding: "10px 20px", 
          borderTop: "1px solid var(--border-color)", 
          backgroundColor: "var(--surface-color)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          width: "100%",
          zIndex: 10
        }}
      >
        <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          💡 Suggested:
        </span>
        <div className="suggestions-scroll-container" style={{ flexGrow: 1 }}>
          {suggestionsLoading ? (
            // Shimmer skeletons
            [1, 2, 3].map((i) => (
              <div 
                key={i} 
                className="shimmer" 
                style={{ 
                  height: "22px", 
                  width: "140px", 
                  borderRadius: "100px", 
                  flexShrink: 0 
                }} 
              />
            ))
          ) : (
            suggestions.map((sug, idx) => (
              <button
                key={idx}
                type="button"
                className="suggestion-chip"
                onClick={() => handleQuerySubmit(sug)}
                disabled={loading}
                style={{
                  borderRadius: "100px",
                  border: "1px solid #2c2c2c",
                  fontSize: "0.75rem",
                  padding: "4px 10px",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
              >
                {sug}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 4. Query Input Area (fixed bottom, ~100px) */}
      <QueryInput
        onSubmit={handleQuerySubmit}
        loading={loading}
        datasetName={selectedDataset.db_name}
        schema={schema}
        onArrowUp={getLastQuestion}
      />
    </div>
  );
}
