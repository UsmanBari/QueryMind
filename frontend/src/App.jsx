import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import UploadView from "./components/UploadView";
import DataPreview from "./components/DataPreview";
import QueryView from "./components/QueryView";
import SchemaPreviewPanel from "./components/SchemaPreviewPanel";
import SchemaQueryView from "./components/SchemaQueryView";
import SchemaUploadModal from "./components/SchemaUploadModal";
import { getDatasets, getSchema, getPreview, getQueryHistory, getSchemaDatasets, getSchemaInfo, getSchemaPreview } from "./api";

export default function App() {
  const [datasets, setDatasets] = useState([]);
  const [schemaDatasets, setSchemaDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [view, setView] = useState("upload"); // upload | preview | query
  const [globalLoading, setGlobalLoading] = useState(false);
  const [datasetsLoading, setDatasetsLoading] = useState(true);

  // Added polish features
  const [history, setHistory] = useState([]);
  const [queriesRun, setQueriesRun] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // 1. Initial Load: Fetch all datasets
  useEffect(() => {
    fetchDatasetsList();
  }, []);

  // Resize listener for mobile responsiveness
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Toast Notification manager
  const addToast = (message, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const fetchDatasetsList = async () => {
    try {
      setDatasetsLoading(true);
      const [csvRes, schemaRes] = await Promise.all([
        getDatasets(),
        getSchemaDatasets().catch(() => ({ datasets: [], total: 0 }))
      ]);
      setDatasets(csvRes.datasets || []);
      setSchemaDatasets(schemaRes.datasets || []);
      setDatasetsLoading(false);
    } catch (err) {
      console.error("Failed to load datasets list:", err);
      setDatasetsLoading(false);
    }
  };

  const fetchQueryHistory = async (dbName) => {
    try {
      const res = await getQueryHistory(dbName);
      setHistory(res.history || []);
    } catch (err) {
      console.error("Failed to fetch query history:", err);
    }
  };

  // 2. Select Dataset: Fetch details and preview in parallel
  const handleSelectDataset = async (datasetInfo) => {
    setGlobalLoading(true);
    try {
      console.log("[App] Selecting dataset:", datasetInfo.db_name, "mode:", datasetInfo.mode);
      
      if (datasetInfo.mode === "schema") {
        const [schemaInfoRes, historyRes] = await Promise.all([
          getSchemaInfo(datasetInfo.db_name),
          getQueryHistory(datasetInfo.db_name).catch(() => ({ history: [] }))
        ]);

        const mergedDataset = {
          db_name: datasetInfo.db_name,
          display_name: datasetInfo.display_name,
          description: datasetInfo.description,
          is_sample: datasetInfo.is_sample,
          mode: "schema",
          total_tables: schemaInfoRes.total_tables,
          total_rows: schemaInfoRes.total_rows,
          relationships: schemaInfoRes.relationships,
          tables: schemaInfoRes.tables
        };

        setSelectedDataset(mergedDataset);
        setHistory(historyRes.history || []);
        setView("preview");
        setGlobalLoading(false);
        return;
      }

      // Existing CSV mode:
      const [schemaRes, previewRes, historyRes] = await Promise.all([
        getSchema(datasetInfo.db_name),
        getPreview(datasetInfo.db_name),
        getQueryHistory(datasetInfo.db_name).catch(() => ({ history: [] }))
      ]);

      const mergedDataset = {
        db_name: datasetInfo.db_name,
        display_name: datasetInfo.display_name,
        description: datasetInfo.description,
        is_sample: datasetInfo.is_sample,
        mode: "csv",
        row_count: schemaRes.row_count,
        columns: schemaRes.columns, // columns details list {name, type, sample_values}
        preview: previewRes // preview data columns and rows
      };

      setSelectedDataset(mergedDataset);
      setHistory(historyRes.history || []);
      setView("preview");
      setGlobalLoading(false);
    } catch (err) {
      console.error("[App] Failed to load dataset details:", err);
      addToast(`Failed to load dataset details: ${err.message}`, "error");
      setGlobalLoading(false);
    }
  };

  // 3. Upload Success Callback: Refresh datasets and select new database
  const handleUploadSuccess = async (uploadResult) => {
    console.log("[App] CSV Upload success callback triggered:", uploadResult);
    addToast("CSV uploaded successfully", "success");
    await fetchDatasetsList();
    handleSelectDataset({
      db_name: uploadResult.db_name,
      display_name: uploadResult.display_name,
      description: uploadResult.message,
      is_sample: false,
      mode: "csv"
    });
  };

  const handleSchemaUploadSuccess = async (uploadResult) => {
    console.log("[App] Schema Upload success callback:", uploadResult);
    await fetchDatasetsList();
    
    const displayFriendlyName = uploadResult.db_name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    handleSelectDataset({
      db_name: uploadResult.db_name,
      display_name: displayFriendlyName,
      description: uploadResult.message,
      is_sample: false,
      mode: "schema"
    });
  };

  // 4. Delete Success Callback: Refresh list and redirect view if active
  const handleDeleteDataset = async (deletedDbName, mode = "csv") => {
    console.log(`[App] Dataset deleted callback triggered: ${deletedDbName} (mode=${mode})`);
    addToast("Dataset deleted", "info");
    if (selectedDataset && selectedDataset.db_name === deletedDbName) {
      setSelectedDataset(null);
      setView("upload");
      setHistory([]);
    }
    fetchDatasetsList();
  };

  const handleStartQuerying = () => {
    setView("query");
  };

  const handleQuerySuccess = () => {
    setQueriesRun((prev) => prev + 1);
    if (selectedDataset) {
      fetchQueryHistory(selectedDataset.db_name);
    }
  };

  const handleRunQuestion = (questionText) => {
    setView("query");
    setActiveQuestion({ text: questionText, timestamp: Date.now() });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden" }}>
      {/* Toast Overlay Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span style={{ marginRight: "12px", wordBreak: "break-word" }}>{t.message}</span>
            <button 
              className="toast-close-btn" 
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Relational Database Upload Modal */}
      {isUploadModalOpen && (
        <SchemaUploadModal 
          onClose={() => setIsUploadModalOpen(false)}
          onUploadSuccess={handleSchemaUploadSuccess}
          addToast={addToast}
        />
      )}

      {/* Top Full-width Stats Bar */}
      <div className="stats-bar">
        <div>
          📊 {datasets.length + schemaDatasets.length} datasets  •  🔍 {queriesRun} queries run
        </div>
        {isMobile && (
          <select
            value={selectedDataset ? `${selectedDataset.mode}:${selectedDataset.db_name}` : ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "upload") {
                setSelectedDataset(null);
                setView("upload");
              } else if (val === "upload_schema") {
                setIsUploadModalOpen(true);
              } else if (val) {
                const [mode, dbName] = val.split(":");
                if (mode === "csv") {
                  const ds = datasets.find((d) => d.db_name === dbName);
                  if (ds) handleSelectDataset({ ...ds, mode: "csv" });
                } else if (mode === "schema") {
                  const ds = schemaDatasets.find((d) => d.db_name === dbName);
                  if (ds) handleSelectDataset({ ...ds, mode: "schema" });
                }
              }
            }}
            className="mobile-dataset-select"
            style={{
              backgroundColor: "var(--surface-color)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "0.75rem",
              outline: "none"
            }}
          >
            <option value="" disabled>Select dataset...</option>
            <optgroup label="Sample CSV Datasets">
              {datasets.filter(d => d.is_sample).map(d => (
                <option key={d.db_name} value={`csv:${d.db_name}`}>{d.display_name}</option>
              ))}
            </optgroup>
            {datasets.some(d => !d.is_sample) && (
              <optgroup label="Your CSV Datasets">
                {datasets.filter(d => !d.is_sample).map(d => (
                  <option key={d.db_name} value={`csv:${d.db_name}`}>{d.display_name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Sample Relational Databases">
              {schemaDatasets.filter(d => d.is_sample).map(d => (
                <option key={d.db_name} value={`schema:${d.db_name}`}>{d.display_name}</option>
              ))}
            </optgroup>
            {schemaDatasets.some(d => !d.is_sample) && (
              <optgroup label="Your Relational Databases">
                {schemaDatasets.filter(d => !d.is_sample).map(d => (
                  <option key={d.db_name} value={`schema:${d.db_name}`}>{d.display_name}</option>
                ))}
              </optgroup>
            )}
            <option value="upload">+ Upload CSV...</option>
            <option value="upload_schema">+ Upload Relational DB...</option>
          </select>
        )}
      </div>

      {/* App Container */}
      <div className="app-container" style={{ height: "calc(100vh - 40px)", display: "flex", flexGrow: 1 }}>
        {/* Sidebar (Left Panel) */}
        <Sidebar
          datasets={datasets}
          schemaDatasets={schemaDatasets}
          selectedDataset={selectedDataset}
          onSelect={handleSelectDataset}
          onUploadSuccess={handleUploadSuccess}
          onUploadSchemaClick={() => setIsUploadModalOpen(true)}
          onDelete={handleDeleteDataset}
          history={history}
          onRunQuestion={handleRunQuestion}
          addToast={addToast}
        />

        {/* Main content Area (Right Panel) */}
        <main className="main-content" style={{ flexGrow: 1, height: "100%", overflowY: "auto" }}>
          {/* Top Navigation Bar (Only shown if a dataset is selected) */}
          {selectedDataset && (
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                marginBottom: "24px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--border-color)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  📁 {selectedDataset.display_name}
                </span>
                <span 
                  className={`badge ${
                    selectedDataset.mode === "schema"
                      ? "badge-user"
                      : (selectedDataset.is_sample ? "badge-sample" : "badge-user")
                  }`}
                  style={selectedDataset.mode === "schema" ? { backgroundColor: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", borderColor: "rgba(139, 92, 246, 0.3)" } : {}}
                >
                  {selectedDataset.mode === "schema" ? "Relational" : (selectedDataset.is_sample ? "Sample" : "User")}
                </span>
              </div>

              {/* View Switch tabs */}
              <div className="view-switch-tabs">
                <button 
                  className={`view-tab ${view === "preview" ? "active" : ""}`}
                  onClick={() => setView("preview")}
                >
                  Data Preview
                </button>
                <button 
                  className={`view-tab ${view === "query" ? "active" : ""}`}
                  onClick={() => setView("query")}
                >
                  Query Studio
                </button>
              </div>
            </div>
          )}

          {/* Global Loading Spinner overlay */}
          {globalLoading ? (
            <div className="loading-container" style={{ margin: "auto" }}>
              <div className="spinner"></div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Loading database metadata and previews...
              </div>
            </div>
          ) : (
            /* Render Active View */
            <>
              {view === "upload" && (
                <UploadView 
                  onUploadSuccess={handleUploadSuccess} 
                  onSchemaUploadSuccess={handleSchemaUploadSuccess}
                />
              )}
              
              {view === "preview" && selectedDataset && selectedDataset.mode === "csv" && (
                <DataPreview 
                  dataset={selectedDataset} 
                  onStartQuerying={handleStartQuerying} 
                />
              )}

              {view === "preview" && selectedDataset && selectedDataset.mode === "schema" && (
                <SchemaPreviewPanel 
                  dataset={selectedDataset} 
                  onStartQuerying={handleStartQuerying}
                  addToast={addToast}
                />
              )}
              
              {view === "query" && selectedDataset && selectedDataset.mode === "csv" && (
                <QueryView 
                  selectedDataset={selectedDataset} 
                  schema={selectedDataset.columns}
                  onQuerySuccess={handleQuerySuccess}
                  activeQuestion={activeQuestion}
                  addToast={addToast}
                />
              )}

              {view === "query" && selectedDataset && selectedDataset.mode === "schema" && (
                <SchemaQueryView 
                  selectedDataset={selectedDataset} 
                  schemaInfo={selectedDataset.tables}
                  onQuerySuccess={handleQuerySuccess}
                  activeQuestion={activeQuestion}
                  addToast={addToast}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}


