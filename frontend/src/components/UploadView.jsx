import React, { useRef, useState } from "react";
import { uploadCSV, uploadSchemaDB } from "../api";

export default function UploadView({ onUploadSuccess, onSchemaUploadSuccess }) {
  // CSV upload state
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [csvState, setCsvState] = useState("idle"); // idle | uploading | success | error
  const [csvError, setCsvError] = useState("");
  const [csvInfo, setCsvInfo] = useState(null);
  const csvInputRef = useRef(null);

  // SQL upload state
  const [sqlDragActive, setSqlDragActive] = useState(false);
  const [sqlState, setSqlState] = useState("idle"); // idle | uploading | success | error
  const [sqlError, setSqlError] = useState("");
  const [sqlInfo, setSqlInfo] = useState(null);
  const [sqlFile, setSqlFile] = useState(null);
  const [erdFile, setErdFile] = useState(null);
  const sqlInputRef = useRef(null);
  const erdInputRef = useRef(null);

  // ===================== CSV handlers =====================
  const handleCsvDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setCsvDragActive(true);
    else if (e.type === "dragleave") setCsvDragActive(false);
  };

  const handleCsvDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCsvDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processCsvFile(e.dataTransfer.files[0]);
    }
  };

  const handleCsvFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await processCsvFile(e.target.files[0]);
    }
  };

  const processCsvFile = async (file) => {
    if (!file.name.endsWith(".csv")) {
      setCsvState("error");
      setCsvError("Only .csv files are supported.");
      return;
    }
    setCsvState("uploading");
    setCsvError("");
    try {
      const result = await uploadCSV(file);
      setCsvState("success");
      setCsvInfo({ display_name: result.display_name, row_count: result.row_count, columns: result.columns.length });
      setTimeout(() => {
        if (onUploadSuccess) onUploadSuccess(result);
        setCsvState("idle");
        setCsvInfo(null);
      }, 1500);
    } catch (err) {
      setCsvState("error");
      setCsvError(err.message || "Failed to upload CSV.");
    }
  };

  // ===================== SQL handlers =====================
  const handleSqlDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setSqlDragActive(true);
    else if (e.type === "dragleave") setSqlDragActive(false);
  };

  const handleSqlDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSqlDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".sql")) {
        setSqlFile(file);
      } else if (file.name.match(/\.(png|jpg|jpeg)$/i)) {
        setErdFile(file);
      }
    }
  };

  const handleSqlFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSqlFile(e.target.files[0]);
    }
  };

  const handleErdFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setErdFile(e.target.files[0]);
    }
  };

  const handleSqlUpload = async () => {
    if (!sqlFile) {
      setSqlState("error");
      setSqlError("A .sql file is required.");
      return;
    }
    setSqlState("uploading");
    setSqlError("");
    try {
      const result = await uploadSchemaDB(sqlFile, erdFile);
      setSqlState("success");
      setSqlInfo({ db_name: result.db_name, total_tables: result.total_tables, total_rows: result.total_rows });
      setTimeout(() => {
        if (onSchemaUploadSuccess) onSchemaUploadSuccess(result);
        setSqlState("idle");
        setSqlInfo(null);
        setSqlFile(null);
        setErdFile(null);
      }, 1500);
    } catch (err) {
      setSqlState("error");
      setSqlError(err.message || "Failed to upload SQL schema.");
    }
  };

  return (
    <div className="empty-state-container" style={{ maxWidth: "none", padding: "32px 24px" }}>
      <h2 style={{ marginBottom: "6px" }}>Analyze Your Data</h2>
      <p style={{ marginBottom: "28px", maxWidth: "600px", margin: "0 auto 28px" }}>
        Upload a dataset to get started. Choose a CSV file for single-table data,
        or a SQL schema file for multi-table relational databases.
      </p>

      {/* Two Side-by-Side Upload Cards */}
      <div style={{ 
        display: "flex", 
        gap: "20px", 
        width: "100%", 
        maxWidth: "900px", 
        margin: "0 auto",
        flexWrap: "wrap"
      }}>

        {/* ─── LEFT CARD: CSV Dataset ─── */}
        <div style={{ 
          flex: "1 1 380px", 
          minWidth: "300px",
          backgroundColor: "var(--surface-color)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.5rem" }}>📊</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>CSV Dataset</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Single table data — sales, employees, any spreadsheet</div>
            </div>
          </div>

          <input type="file" ref={csvInputRef} onChange={handleCsvFileChange} accept=".csv" style={{ display: "none" }} />

          <div
            className={`drag-drop-zone ${csvDragActive ? "active" : ""}`}
            onDragEnter={handleCsvDrag}
            onDragOver={handleCsvDrag}
            onDragLeave={handleCsvDrag}
            onDrop={handleCsvDrop}
            onClick={() => csvInputRef.current && csvInputRef.current.click()}
            style={{
              borderColor: csvDragActive ? "#3b82f6" : "var(--border-color)",
              minHeight: "130px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s"
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Drop a CSV file here</span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>or click to browse • .csv files only</span>
          </div>

          <button
            className="btn-primary"
            onClick={() => csvInputRef.current && csvInputRef.current.click()}
            disabled={csvState === "uploading"}
            style={{ 
              width: "100%", 
              justifyContent: "center", 
              backgroundColor: "#3b82f6",
              fontSize: "0.85rem"
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#2563eb"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#3b82f6"}
          >
            Browse CSV
          </button>

          {/* CSV Upload States */}
          {csvState === "uploading" && (
            <div className="upload-status uploading" style={{ fontSize: "0.82rem" }}>
              <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px", display: "inline-block", marginRight: "8px", verticalAlign: "middle" }} />
              Processing CSV...
            </div>
          )}
          {csvState === "success" && csvInfo && (
            <div className="upload-status success" style={{ fontSize: "0.82rem" }}>
              ✓ Imported <strong>{csvInfo.display_name}</strong> — {csvInfo.row_count} rows, {csvInfo.columns} columns
            </div>
          )}
          {csvState === "error" && (
            <div className="upload-status error" style={{ fontSize: "0.82rem" }}>
              ✕ {csvError}
            </div>
          )}
        </div>

        {/* ─── RIGHT CARD: Relational Database ─── */}
        <div style={{ 
          flex: "1 1 380px", 
          minWidth: "300px",
          backgroundColor: "var(--surface-color)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.5rem" }}>🔗</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>Relational Database</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>T-SQL or SQLite schema with CREATE TABLE and INSERT statements</div>
            </div>
          </div>

          <input type="file" ref={sqlInputRef} onChange={handleSqlFileChange} accept=".sql" style={{ display: "none" }} />
          <input type="file" ref={erdInputRef} onChange={handleErdFileChange} accept=".png,.jpg,.jpeg" style={{ display: "none" }} />

          {/* SQL Drop Zone (main) */}
          <div
            className={`drag-drop-zone ${sqlDragActive ? "active" : ""}`}
            onDragEnter={handleSqlDrag}
            onDragOver={handleSqlDrag}
            onDragLeave={handleSqlDrag}
            onDrop={handleSqlDrop}
            onClick={() => sqlInputRef.current && sqlInputRef.current.click()}
            style={{
              borderColor: sqlFile ? "var(--success-color)" : (sqlDragActive ? "#8b5cf6" : "var(--border-color)"),
              minHeight: "80px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.2s"
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>📄</span>
            <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>
              {sqlFile ? `✓ ${sqlFile.name}` : "Drop a .sql file here"}
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {sqlFile ? "Click to change" : "Schema file (required)"}
            </span>
          </div>

          {/* ERD Image Zone (optional, smaller) */}
          <div
            className="drag-drop-zone"
            onClick={() => erdInputRef.current && erdInputRef.current.click()}
            style={{
              borderColor: erdFile ? "var(--success-color)" : "var(--border-color)",
              minHeight: "50px",
              padding: "10px",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: "pointer"
            }}
          >
            <span style={{ fontSize: "0.9rem" }}>🖼️</span>
            <span style={{ fontSize: "0.78rem", color: erdFile ? "var(--success-color)" : "var(--text-muted)" }}>
              {erdFile ? `✓ ${erdFile.name}` : "ERD image — .png/.jpg (optional)"}
            </span>
          </div>

          <button
            className="btn-primary"
            onClick={handleSqlUpload}
            disabled={!sqlFile || sqlState === "uploading"}
            style={{ 
              width: "100%", 
              justifyContent: "center", 
              backgroundColor: "#8b5cf6",
              fontSize: "0.85rem",
              opacity: (!sqlFile || sqlState === "uploading") ? 0.5 : 1
            }}
            onMouseEnter={(e) => { if (sqlFile) e.target.style.backgroundColor = "#7c3aed"; }}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#8b5cf6"}
          >
            {sqlState === "uploading" ? (
              <span style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
                <span className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }} />
                Processing...
              </span>
            ) : (
              "Upload SQL Schema"
            )}
          </button>

          {/* SQL Upload States */}
          {sqlState === "success" && sqlInfo && (
            <div className="upload-status success" style={{ fontSize: "0.82rem" }}>
              ✓ Created <strong>{sqlInfo.db_name}</strong> — {sqlInfo.total_tables} tables, {sqlInfo.total_rows.toLocaleString()} rows
            </div>
          )}
          {sqlState === "error" && (
            <div className="upload-status error" style={{ fontSize: "0.82rem" }}>
              ✕ {sqlError}
            </div>
          )}
        </div>
      </div>

      {/* Bottom hint */}
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "20px", textAlign: "center" }}>
        Or select an existing sample dataset from the sidebar to start querying immediately.
      </p>
    </div>
  );
}
