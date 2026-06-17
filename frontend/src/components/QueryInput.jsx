import React, { useState, useEffect } from "react";

export default function QueryInput({ onSubmit, loading, datasetName, schema, onArrowUp }) {
  const [question, setQuestion] = useState("");

  // Clear input when dataset changes
  useEffect(() => {
    setQuestion("");
  }, [datasetName]);

  const handleFormSubmit = (e) => {
    if (e) e.preventDefault();
    if (!question || question.trim().length < 3 || loading) return;
    
    onSubmit(question.trim());
    setQuestion("");
  };

  const handleKeyDown = (e) => {
    // Enter key or Ctrl+Enter submits the form, but Shift+Enter adds a newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFormSubmit();
    } else if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleFormSubmit();
    }

    // Arrow Up when input is empty fills with last question
    if (e.key === "ArrowUp" && !question.trim()) {
      if (onArrowUp) {
        const lastQ = onArrowUp();
        if (lastQ) {
          e.preventDefault();
          setQuestion(lastQ);
        }
      }
    }
  };

  return (
    <div className="query-input-section" style={{ borderTop: "1px solid var(--border-color)", padding: "16px 20px" }}>
      <form onSubmit={handleFormSubmit} style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
        <div style={{ flexGrow: 1, position: "relative" }}>
          <textarea
            className="query-input"
            style={{ width: "100%", height: "64px", resize: "none", display: "block" }}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask a question about '${datasetName}' in plain English... (Ctrl+Enter to submit, Arrow Up for last question)`}
            disabled={loading}
            rows={2}
          />
        </div>
        
        <button
          type="submit"
          className="btn-primary"
          style={{ height: "48px", padding: "0 20px", display: "flex", alignItems: "center", gap: "6px" }}
          disabled={loading || !question.trim() || question.trim().length < 3}
        >
          <span>Ask</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
    </div>
  );
}

