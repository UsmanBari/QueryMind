import React, { useRef, useState } from "react";
import { uploadCSV, deleteDataset, deleteSchemaDataset } from "../api";

export default function Sidebar({
  datasets,
  schemaDatasets = [],
  selectedDataset,
  onSelect,
  onUploadSuccess,
  onUploadSchemaClick,
  onDelete,
  history,
  onRunQuestion,
  addToast
}) {
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset file input
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      addToast("Only .csv files are allowed.", "error");
      return;
    }

    setIsUploading(true);
    try {
      console.log("[Sidebar] Uploading CSV file:", file.name);
      const result = await uploadCSV(file);
      setIsUploading(false);
      if (onUploadSuccess) {
        onUploadSuccess(result);
      }
    } catch (err) {
      setIsUploading(false);
      addToast("Upload failed: " + err.message, "error");
    }
  };

  const handleDeleteClick = async (e, dbName, mode = "csv") => {
    e.stopPropagation(); // Avoid selecting the dataset card when deleting
    if (window.confirm(`Are you sure you want to delete the dataset '${dbName}'?`)) {
      try {
        console.log(`[Sidebar] Deleting ${mode} dataset:`, dbName);
        if (mode === "schema") {
          await deleteSchemaDataset(dbName);
        } else {
          await deleteDataset(dbName);
        }
        if (onDelete) {
          onDelete(dbName, mode);
        }
      } catch (err) {
        addToast("Delete failed: " + err.message, "error");
      }
    }
  };



  // Separate sample vs user datasets
  const sampleDatasets = datasets.filter((ds) => ds.is_sample);
  const userDatasets = datasets.filter((ds) => !ds.is_sample);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-logo">
          🔍 NL Analyst<span>.</span>
        </h1>
      </div>
      
      <div className="sidebar-content">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv"
          style={{ display: "none" }}
        />

        {/* ① "🔗 Relational Databases" section (purple #8b5cf6) — AT THE TOP */}
        <div>
          <div className="divider-label" style={{ color: "#8b5cf6", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🔗</span> Relational Databases
          </div>
          
          <button
            className="btn-primary"
            onClick={onUploadSchemaClick}
            style={{ 
              width: "100%", 
              justifyContent: "center", 
              backgroundColor: "#8b5cf6", 
              marginBottom: "12px",
              fontSize: "0.8rem",
              padding: "8px 12px"
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#7c3aed"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#8b5cf6"}
          >
            + Upload Schema DB
          </button>
          
          {schemaDatasets && schemaDatasets.length > 0 ? (
            <div className="dataset-list">
              {schemaDatasets.map((ds) => {
                const isSelected = selectedDataset && selectedDataset.db_name === ds.db_name && selectedDataset.mode === "schema";
                return (
                  <button
                    key={ds.db_name}
                    className={`dataset-item ${isSelected ? "selected" : ""}`}
                    onClick={() => onSelect({ ...ds, mode: "schema" })}
                    style={isSelected ? { borderLeftColor: "#8b5cf6", backgroundColor: "rgba(139, 92, 246, 0.1)" } : {}}
                  >
                    <div className="dataset-info-block">
                      <div className="dataset-title-row">
                        <span className="dataset-name">{ds.display_name}</span>
                        <span 
                          className="badge" 
                          style={{ 
                            backgroundColor: "rgba(139, 92, 246, 0.15)", 
                            color: "#a78bfa", 
                            border: "1px solid rgba(139, 92, 246, 0.3)" 
                          }}
                        >
                          RELATIONAL
                        </span>
                      </div>
                      <span className="dataset-meta">
                        {ds.total_tables} tables • {ds.relationships ? ds.relationships.length : 0} relationships
                      </span>
                    </div>
                    {!ds.is_sample && (
                      <button
                        className="btn-delete-dataset"
                        onClick={(e) => handleDeleteClick(e, ds.db_name, "schema")}
                        title="Delete relational dataset"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </button>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", padding: "10px", border: "1px dashed var(--border-color)", borderRadius: "6px", marginBottom: "16px" }}>
              Upload a .sql schema file to query relational data
            </div>
          )}
        </div>

        {/* ② Divider line */}
        <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "16px 0" }} />

        {/* ③ "📊 CSV Datasets" section (blue #3b82f6) — IN THE MIDDLE */}
        <div>
          <div className="divider-label" style={{ color: "#3b82f6", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>📊</span> CSV Datasets
          </div>
          
          <button
            className="btn-primary"
            onClick={handleUploadClick}
            disabled={isUploading}
            style={{ 
              width: "100%", 
              justifyContent: "center",
              backgroundColor: "#3b82f6",
              marginBottom: "12px"
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#2563eb"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#3b82f6"}
          >
            {isUploading ? "Uploading..." : "+ Upload CSV"}
          </button>

          <div className="dataset-list">
            {sampleDatasets.map((ds) => {
              const isSelected = selectedDataset && selectedDataset.db_name === ds.db_name && selectedDataset.mode !== "schema";
              return (
                <button
                  key={ds.db_name}
                  className={`dataset-item ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelect(ds)}
                >
                  <div className="dataset-info-block">
                    <div className="dataset-title-row">
                      <span className="dataset-name">{ds.display_name}</span>
                      <span className="badge badge-sample">Sample</span>
                    </div>
                    <span className="dataset-meta">
                      {ds.row_count} rows • {ds.columns.length} columns
                    </span>
                  </div>
                </button>
              );
            })}

            {userDatasets.map((ds) => {
              const isSelected = selectedDataset && selectedDataset.db_name === ds.db_name && selectedDataset.mode !== "schema";
              return (
                <button
                  key={ds.db_name}
                  className={`dataset-item ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelect(ds)}
                >
                  <div className="dataset-info-block">
                    <div className="dataset-title-row">
                      <span className="dataset-name">{ds.display_name}</span>
                      <span className="badge badge-user">User</span>
                    </div>
                    <span className="dataset-meta">
                      {ds.row_count} rows • {ds.columns.length} columns
                    </span>
                  </div>
                  <button
                    className="btn-delete-dataset"
                    onClick={(e) => handleDeleteClick(e, ds.db_name)}
                    title="Delete dataset"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </button>
              );
            })}
          </div>
        </div>


        {/* Recent Queries Section */}
        {selectedDataset && history && history.length > 0 && (
          <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
            <div className="divider-label">Recent Queries</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {history.slice(0, 5).map((item, idx) => (
                <button
                  key={idx}
                  className="dataset-item"
                  onClick={() => onRunQuestion && onRunQuestion(item.question)}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--surface-elevated)",
                    borderRadius: "6px"
                  }}
                  title={item.question}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", width: "100%" }}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-muted)"
                      strokeWidth="2.5"
                      style={{ flexShrink: 0 }}
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "var(--text-secondary)"
                      }}
                    >
                      {item.question}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
