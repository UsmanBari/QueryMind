import React, { useState, useRef } from "react";
import { uploadSchemaDB } from "../api";

export default function SchemaUploadModal({ onClose, onUploadSuccess, addToast }) {
  const [sqlFile, setSqlFile] = useState(null);
  const [dbFile, setDbFile] = useState(null);
  const [erdImage, setErdImage] = useState(null);
  const [erdPreview, setErdPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Parse details
  const [parsedTablesCount, setParsedTablesCount] = useState(0);
  const [parsedKeysCount, setParsedKeysCount] = useState(0);

  const sqlInputRef = useRef(null);
  const dbInputRef = useRef(null);
  const erdInputRef = useRef(null);

  const handleSqlFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith(".sql")) {
      addToast("Schema file must be a .sql file", "error");
      return;
    }
    setSqlFile(file);

    // Read and parse sql file with client-side regex
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      // Simple table match
      const tablesMatch = content.match(/CREATE\s+TABLE\s+\w+/gi) || [];
      // Simple foreign key match
      const keysMatch = content.match(/FOREIGN\s+KEY/gi) || [];
      setParsedTablesCount(tablesMatch.length);
      setParsedKeysCount(keysMatch.length);
    };
    reader.readAsText(file);
  };

  const handleErdFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".pdf"].includes(ext)) {
      addToast("ERD image must be a .png, .jpg, .jpeg, or .pdf file.", "error");
      return;
    }
    setErdImage(file);
    if (ext !== ".pdf") {
      setErdPreview(URL.createObjectURL(file));
    } else {
      setErdPreview(null);
    }
  };

  const handleDbFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith(".db") && !file.name.endsWith(".sqlite")) {
      addToast("Database file must be a .db or .sqlite file", "error");
      return;
    }
    setDbFile(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!dbFile) {
      setError("Database file (.db) is required.");
      addToast("Database file (.db) is required.", "error");
      return;
    }
    if (!sqlFile && !erdImage) {
      setError("Please provide either a .sql schema file or an ERD diagram image");
      addToast("Please provide either a .sql schema file or an ERD diagram image", "error");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      console.log("[SchemaUploadModal] Submitting files to server...");
      const result = await uploadSchemaDB(sqlFile, erdImage);
      setSuccess(true);
      setIsUploading(false);
      addToast("Relational database uploaded successfully!", "success");
      
      // Auto-dismiss after 2 seconds
      setTimeout(() => {
        if (onUploadSuccess) {
          onUploadSuccess(result);
        }
        onClose();
      }, 2000);
    } catch (err) {
      console.error("[SchemaUploadModal] Upload failed:", err);
      setError(err.message || "Failed to upload files.");
      setIsUploading(false);
      addToast("Upload failed: " + err.message, "error");
    }
  };

  return (
    <div 
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(4px)"
      }}
    >
      <div 
        style={{
          backgroundColor: "var(--surface-color)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          width: "550px",
          maxWidth: "90%",
          padding: "24px",
          position: "relative",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
          maxHeight: "90vh",
          overflowY: "auto"
        }}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px", right: "16px",
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: "1.5rem",
            cursor: "pointer",
            outline: "none"
          }}
        >
          &times;
        </button>

        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🔗</span> Upload Relational Database
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "20px" }}>
          Provide a database file (.db) along with a schema DDL (.sql) or an ERD diagram image to start querying.
        </p>

        <form onSubmit={handleUploadSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* File Selection Zones Stacked Vertically */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Zone 1 — Schema File (.sql) — OPTIONAL */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>
                  Schema File (.sql)
                </span>
                <span style={{ fontSize: "0.7rem", backgroundColor: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px", color: "var(--text-muted)", fontWeight: "600" }}>
                  OPTIONAL
                </span>
              </div>
              <div 
                onClick={() => sqlInputRef.current && sqlInputRef.current.click()}
                className="drag-drop-zone"
                style={{
                  padding: "16px 12px",
                  borderRadius: "8px",
                  borderColor: sqlFile ? "var(--success-color)" : "var(--border-color)",
                  borderStyle: "dashed",
                  borderWidth: "2px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255, 255, 255, 0.02)"
                }}
              >
                <input 
                  type="file" 
                  ref={sqlInputRef} 
                  accept=".sql" 
                  onChange={handleSqlFileChange} 
                  style={{ display: "none" }} 
                />
                <span style={{ fontSize: "1.3rem" }}>📄</span>
                <strong style={{ fontSize: "0.8rem", color: "var(--text-primary)" }}>
                  {sqlFile ? sqlFile.name : "Schema (.sql)"}
                </strong>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  (optional if ERD image provided)
                </span>
              </div>
            </div>

            {/* Zone 2 — ERD Diagram Image — OPTIONAL */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>
                  ERD Diagram Image
                </span>
                <span style={{ fontSize: "0.7rem", backgroundColor: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px", color: "var(--text-muted)", fontWeight: "600" }}>
                  OPTIONAL
                </span>
              </div>
              <div 
                onClick={() => erdInputRef.current && erdInputRef.current.click()}
                className="drag-drop-zone"
                style={{
                  padding: "16px 12px",
                  borderRadius: "8px",
                  borderColor: erdImage ? "var(--success-color)" : "var(--border-color)",
                  borderStyle: "dashed",
                  borderWidth: "2px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255, 255, 255, 0.02)"
                }}
              >
                <input 
                  type="file" 
                  ref={erdInputRef} 
                  accept=".png,.jpg,.jpeg,.pdf" 
                  onChange={handleErdFileChange} 
                  style={{ display: "none" }} 
                />
                <span style={{ fontSize: "1.3rem" }}>🖼️</span>
                <strong style={{ fontSize: "0.8rem", color: "var(--text-primary)" }}>
                  {erdImage ? erdImage.name : "ERD Diagram Image"}
                </strong>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px", textAlign: "center", padding: "0 12px" }}>
                  Upload your ERD diagram — we'll extract relationships, cardinality (1:1, 1:N, N:M), and participation constraints automatically
                </span>
                {erdImage && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", width: "100%", justifyContent: "center" }}>
                    {erdPreview && (
                      <img 
                        src={erdPreview} 
                        alt="ERD Thumbnail" 
                        style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--border-color)" }} 
                      />
                    )}
                    <span style={{ fontSize: "0.7rem", backgroundColor: "rgba(139, 92, 246, 0.2)", color: "#a78bfa", padding: "3px 8px", borderRadius: "12px", fontWeight: "600" }}>
                      🤖 AI will analyze this image
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Zone 3 — Database File (.db) — REQUIRED */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>
                  Database File (.db)
                </span>
                <span style={{ fontSize: "0.7rem", backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--error-color)", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" }}>
                  REQUIRED
                </span>
              </div>
              <div 
                onClick={() => dbInputRef.current && dbInputRef.current.click()}
                className="drag-drop-zone"
                style={{
                  padding: "16px 12px",
                  borderRadius: "8px",
                  borderColor: dbFile ? "var(--success-color)" : "var(--border-color)",
                  borderStyle: "dashed",
                  borderWidth: "2px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255, 255, 255, 0.02)"
                }}
              >
                <input 
                  type="file" 
                  ref={dbInputRef} 
                  accept=".db,.sqlite" 
                  onChange={handleDbFileChange} 
                  style={{ display: "none" }} 
                />
                <span style={{ fontSize: "1.3rem" }}>🗃️</span>
                <strong style={{ fontSize: "0.8rem", color: "var(--text-primary)" }}>
                  {dbFile ? dbFile.name : "Database (.db)"}
                </strong>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  SQLite database containing tables data
                </span>
              </div>
            </div>

          </div>

          {/* Schema Preview Details Section */}
          {(sqlFile || erdImage) && (
            <div 
              style={{
                backgroundColor: "var(--bg-color)",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                padding: "12px",
                fontSize: "0.8rem",
                lineHeight: "1.5"
              }}
            >
              {sqlFile && !erdImage && (
                <>
                  <div style={{ color: "var(--success-color)", fontWeight: 600 }}>
                    ✓ Detected {parsedTablesCount} tables and {parsedKeysCount} relationships
                  </div>
                  {parsedKeysCount === 0 && (
                    <div style={{ color: "var(--warning-color)", marginTop: "4px", fontSize: "0.75rem" }}>
                      ⚠️ No FOREIGN KEY constraints detected — schema mode works best with related tables.
                    </div>
                  )}
                </>
              )}
              {erdImage && !sqlFile && (
                <div style={{ color: "#a78bfa", fontWeight: 600 }}>
                  🤖 Schema will be extracted from ERD image using AI vision
                </div>
              )}
              {sqlFile && erdImage && (
                <div style={{ color: "#a78bfa", fontWeight: 600 }}>
                  ✓ Schema from .sql file will be enriched with ERD relationship details
                </div>
              )}
            </div>
          )}

          {/* Success Summary Info */}
          {success && (
            <div 
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid var(--success-color)",
                borderRadius: "6px",
                padding: "12px",
                color: "var(--success-color)",
                fontSize: "0.85rem",
                textAlign: "center"
              }}
            >
              ✓ Database loaded. Transitioning workspace...
            </div>
          )}

          {/* Error Details */}
          {error && (
            <div 
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                border: "1px solid var(--error-color)",
                borderRadius: "6px",
                padding: "12px",
                color: "var(--error-color)",
                fontSize: "0.8rem"
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Submit Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={onClose}
              disabled={isUploading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={(!sqlFile && !erdImage) || !dbFile || isUploading || success}
              style={{
                backgroundColor: "#8b5cf6",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              {isUploading ? (
                <>
                  <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }} />
                  <span>Uploading...</span>
                </>
              ) : (
                <span>
                  {sqlFile && !erdImage && "Upload Schema"}
                  {erdImage && !sqlFile && "Upload & Extract Schema from ERD"}
                  {sqlFile && erdImage && "Upload & Enrich with ERD"}
                  {!sqlFile && !erdImage && "Upload Database"}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
