import React from "react";
import DataTable from "./DataTable";

export default function DataPreview({ dataset, onStartQuerying }) {
  if (!dataset) return null;

  // Extract columns (schema) and rows (preview data)
  const columnsSchema = dataset.columns || [];
  const previewData = dataset.preview || { columns: [], rows: [] };
  const displayDescription = dataset.description || `Database containing ${dataset.display_name} tables.`;

  const getTypeBadgeClass = (type) => {
    const t = type ? type.toUpperCase() : "TEXT";
    if (t === "INTEGER" || t === "REAL") return "badge-type integer";
    if (t === "DATE" || t === "TIMESTAMP" || t === "DATETIME") return "badge-type date";
    return "badge-type text";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* 1. Dataset Info Card */}
      <div className="preview-header">
        <div className="preview-title-area">
          <h1>{dataset.display_name}</h1>
          <p className="preview-description">{displayDescription}</p>
          <div className="stat-badges">
            <div className="stat-badge">
              <span>Total Rows:</span>
              <span>{dataset.row_count}</span>
            </div>
            <div className="stat-badge">
              <span>Columns:</span>
              <span>{columnsSchema.length}</span>
            </div>
            <div className="stat-badge">
              <span>Format:</span>
              <span>SQLite</span>
            </div>
          </div>
        </div>
        
        {/* Start Querying button */}
        <button className="btn-primary" onClick={onStartQuerying}>
          Start Asking Questions →
        </button>
      </div>

      {/* 2. Schema Table Section */}
      <div>
        <h2 className="section-title">Database Schema</h2>
        <div className="table-container">
          <table className="table-preview">
            <thead>
              <tr>
                <th>Column Name</th>
                <th>Data Type</th>
                <th>Sample Values</th>
              </tr>
            </thead>
            <tbody>
              {columnsSchema.map((col, idx) => (
                <tr key={idx}>
                  <td className="cell-mono" style={{ fontWeight: 600 }}>{col.name}</td>
                  <td>
                    <span className={`badge ${getTypeBadgeClass(col.type)}`}>
                      {col.type}
                    </span>
                  </td>
                  <td className="cell-mono" style={{ color: "var(--text-secondary)" }}>
                    {col.sample_values && col.sample_values.length > 0
                      ? col.sample_values.map(val => (val === null ? "null" : String(val))).join(", ")
                      : "No examples available"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Data Preview Section (first 10 rows) */}
      <div>
        <h2 className="section-title">Data Preview (first 10 rows)</h2>
        <DataTable 
          columns={previewData.columns} 
          rows={previewData.rows} 
          maxHeight="320px" 
        />
      </div>

      {/* Bottom CTA Button */}
      <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-primary" onClick={onStartQuerying}>
          Start Asking Questions →
        </button>
      </div>
    </div>
  );
}
