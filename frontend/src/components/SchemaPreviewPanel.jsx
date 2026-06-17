import React, { useState, useEffect } from "react";
import { getSchemaInfo, getSchemaPreview } from "../api";
import DataTable from "./DataTable";

const getParticipationExplanation = (rel) => {
  const from = rel.from_table || "";
  const to = rel.to_table || "";
  const fromPart = rel.from_participation || "total";
  const toPart = rel.to_participation || "partial";
  
  const singular = (name) => {
    if (name.endsWith("ies")) return name.slice(0, -3) + "y";
    if (name.endsWith("s")) return name.slice(0, -1);
    return name;
  };
  
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  
  const fromExp = fromPart === "total"
    ? `every ${singular(from)} must have a ${singular(to)}`
    : `not all ${from} have ${to}`;
    
  const toExp = toPart === "total"
    ? `every ${singular(to)} must have ${from}`
    : `not all ${to} have ${from}`;
    
  return {
    fromText: <>{cap(singular(from))} participation: <strong>{fromPart}</strong> ({fromExp})</>,
    toText: <>{cap(singular(to))} participation: <strong>{toPart}</strong> ({toExp})</>
  };
};

export default function SchemaPreviewPanel({ dataset, onStartQuerying, addToast }) {
  const [schemaInfo, setSchemaInfo] = useState(null);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("");
  const [hoveredRel, setHoveredRel] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const loadSchemaDetails = async () => {
      setLoading(true);
      try {
        console.log("[SchemaPreviewPanel] Fetching details for:", dataset.db_name);
        const [infoRes, previewRes] = await Promise.all([
          getSchemaInfo(dataset.db_name),
          getSchemaPreview(dataset.db_name)
        ]);
        
        setSchemaInfo(infoRes);
        setPreviews(previewRes.previews || []);
        
        if (infoRes.tables && infoRes.tables.length > 0) {
          setActiveTab(infoRes.tables[0].name);
        }
        setLoading(false);
      } catch (err) {
        console.error("[SchemaPreviewPanel] Failed to load schema info:", err);
        addToast("Failed to load schema details: " + err.message, "error");
        setLoading(false);
      }
    };

    if (dataset) {
      loadSchemaDetails();
    }
  }, [dataset]);

  if (loading) {
    return (
      <div className="loading-container" style={{ margin: "auto" }}>
        <div className="spinner" style={{ borderColor: "var(--border-color)", borderTopColor: "#8b5cf6" }}></div>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Loading relational schema and ER diagram...
        </div>
      </div>
    );
  }

  if (!schemaInfo) {
    return (
      <div style={{ color: "var(--error-color)", padding: "24px", textAlign: "center" }}>
        Failed to load schema details.
      </div>
    );
  }

  // Math positions for ERD SVG
  const numTables = schemaInfo.tables.length;
  const positions = {};
  let svgWidth = 700;
  let svgHeight = 380;
  
  // Custom gorgeous layout for the ecommerce sample database
  if (dataset.db_name === "ecommerce") {
    positions["customers"] = { x: 40, y: 30 };
    positions["products"] = { x: 40, y: 230 };
    positions["orders"] = { x: 260, y: 130 };
    positions["order_items"] = { x: 480, y: 30 };
    positions["reviews"] = { x: 480, y: 230 };
  } else {
    // Generic column-wise grid positioning
    const colCount = numTables >= 6 ? 2 : 3;
    const numRows = Math.ceil(numTables / colCount);
    
    // Set explicit dimensions instead of generic 700x380
    svgWidth = Math.max(700, 40 + colCount * 220);
    svgHeight = Math.max(380, 30 + numRows * 170);

    schemaInfo.tables.forEach((tbl, idx) => {
      const col = idx % colCount;
      const row = Math.floor(idx / colCount);
      positions[tbl.name] = {
        x: 40 + col * 220,
        y: 30 + row * 170
      };
    });
  }

  const getLineCoords = (rel) => {
    const p1 = positions[rel.from_table];
    const p2 = positions[rel.to_table];
    if (!p1 || !p2) return { x1: 0, y1: 0, x2: 0, y2: 0, isSelfLoop: false };

    const width = 170;
    const height = 110;

    let x1, y1, x2, y2;
    let isSelfLoop = false;

    if (rel.from_table === rel.to_table) {
      isSelfLoop = true;
      // Coordinates for self-loop drawing
      x1 = p1.x + width - 20; // Start near the top right
      y1 = p1.y;
      x2 = p1.x + width; // End near the middle right
      y2 = p1.y + 40;
      return { x1, y1, x2, y2, isSelfLoop, width, height, p1 };
    }

    // Check relative alignment
    if (p1.x + width < p2.x) {
      // p1 is left of p2
      x1 = p1.x + width;
      y1 = p1.y + height / 2;
      x2 = p2.x;
      y2 = p2.y + height / 2;
    } else if (p2.x + width < p1.x) {
      // p1 is right of p2
      x1 = p1.x;
      y1 = p1.y + height / 2;
      x2 = p2.x + width;
      y2 = p2.y + height / 2;
    } else {
      // Vertically aligned
      x1 = p1.x + width / 2;
      x2 = p2.x + width / 2;
      if (p1.y < p2.y) {
        y1 = p1.y + height;
        y2 = p2.y;
      } else {
        y1 = p1.y;
        y2 = p2.y + height;
      }
    }

    return { x1, y1, x2, y2, isSelfLoop: false };
  };

  const activePreview = previews.find(p => p.table_name === activeTab);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Info Banner */}
      <div 
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "16px"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {schemaInfo.db_name === "ecommerce" ? "E-Commerce Database" : schemaInfo.db_name.replace("_", " ").toUpperCase()}
          </h2>
          <div style={{ display: "flex", gap: "12px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            <span>📂 <strong>{schemaInfo.total_tables}</strong> tables</span>
            <span>•</span>
            <span>🔗 <strong>{schemaInfo.relationships.length}</strong> relationships</span>
            <span>•</span>
            <span>📊 <strong>{schemaInfo.total_rows.toLocaleString()}</strong> total rows</span>
          </div>
        </div>
        <button 
          className="btn-primary" 
          onClick={onStartQuerying}
          style={{ backgroundColor: "#8b5cf6" }}
        >
          Start Asking Questions &rarr;
        </button>
      </div>

      {/* SVG ERD Section */}
      <div 
        style={{
          backgroundColor: "var(--surface-color)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "16px",
          position: "relative"
        }}
      >
        <div style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", color: "#a78bfa", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Entity Relationship Diagram (ERD)</span>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {hoveredRel && (
              <span style={{ fontSize: "0.75rem", textTransform: "none", color: "var(--text-primary)", backgroundColor: "#2d1b69", padding: "2px 8px", borderRadius: "4px" }}>
                Relationship: <code>{hoveredRel.from_table}.{hoveredRel.from_column}</code> &rarr; <code>{hoveredRel.to_table}.{hoveredRel.to_column}</code>
              </span>
            )}
            <button 
              onClick={() => {
                const el = document.getElementById("erd-scroll-area");
                if (el) { el.scrollTop = 0; el.scrollLeft = 0; }
              }}
              style={{
                backgroundColor: "#2d1b69",
                border: "1px solid #8b5cf6",
                color: "#f9fafb",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "0.75rem",
                cursor: "pointer",
                textTransform: "none"
              }}
            >
              ↺ Reset View
            </button>
          </div>
        </div>
        
        <style>{`
          .erd-scroll-container::-webkit-scrollbar { width: 8px; height: 8px; }
          .erd-scroll-container::-webkit-scrollbar-thumb { background: #8b5cf6; border-radius: 4px; }
          .erd-scroll-container::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 4px; }
        `}</style>
        
        <div id="erd-scroll-area" className="erd-scroll-container" style={{ width: "100%", maxHeight: "60vh", overflow: "auto", border: "1px solid var(--border-color)", borderRadius: "6px", backgroundColor: "#0f0f0f" }}>
          <svg 
            width={svgWidth}
            height={svgHeight}
            style={{ minWidth: "650px", display: "block" }}
          >
            {/* Markers Definitions for Arrows */}
            <defs>
              <marker 
                id="arrow" 
                viewBox="0 0 10 10" 
                refX="8" refY="5" 
                markerWidth="5" markerHeight="5" 
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
              </marker>
            </defs>

            {/* Relationship Lines */}
            {schemaInfo.relationships.map((rel, idx) => {
              const coords = getLineCoords(rel);
              if (coords.x1 === 0 && coords.y1 === 0 && coords.x2 === 0 && coords.y2 === 0) return null;
              
              const isHovered = hoveredRel && 
                hoveredRel.from_table === rel.from_table && 
                hoveredRel.from_column === rel.from_column &&
                hoveredRel.to_table === rel.to_table &&
                hoveredRel.to_column === rel.to_column;

              const dx = coords.x2 - coords.x1;
              const dy = coords.y2 - coords.y1;
              const len = Math.sqrt(dx * dx + dy * dy);
              const ux = len > 0 ? dx / len : 0;
              const uy = len > 0 ? dy / len : 0;
              const px = -uy;
              const py = ux;

              const xMid = (coords.x1 + coords.x2) / 2;
              const yMid = (coords.y1 + coords.y2) / 2;

              const cardinality = rel.cardinality || "1:N";
              const fromPart = rel.from_participation || "total";
              const toPart = rel.to_participation || "partial";

              return (
                <g 
                  key={idx}
                  onMouseEnter={() => setHoveredRel(rel)}
                  onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredRel(null)}
                  style={{ cursor: "pointer" }}
                >
                  {coords.isSelfLoop ? (
                    <>
                      {/* Thick transparent interactive buffer path for easier hovering */}
                      <path 
                        d={`M ${coords.x1} ${coords.y1} C ${coords.x1 + 80} ${coords.y1 - 30}, ${coords.x2 + 80} ${coords.y2 + 30}, ${coords.x2} ${coords.y2}`}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={15}
                      />
                      <path 
                        d={`M ${coords.x1} ${coords.y1} C ${coords.x1 + 80} ${coords.y1 - 30}, ${coords.x2 + 80} ${coords.y2 + 30}, ${coords.x2} ${coords.y2}`}
                        fill="none"
                        stroke={isHovered ? "#a78bfa" : "#8b5cf6"}
                        strokeWidth={isHovered ? 2.5 : 1.5}
                        strokeDasharray={fromPart === "partial" || toPart === "partial" ? "4, 4" : "none"}
                      />
                      {/* Arrow at the end of the loop to indicate direction */}
                      <polygon 
                        points={`${coords.x2},${coords.y2} ${coords.x2 + 10},${coords.y2 - 5} ${coords.x2 + 8},${coords.y2} ${coords.x2 + 10},${coords.y2 + 5}`}
                        fill={isHovered ? "#a78bfa" : "#8b5cf6"}
                      />
                    </>
                  ) : (
                    <>
                      {/* Thick transparent interactive buffer line for easier hovering */}
                      <line 
                        x1={coords.x1} y1={coords.y1}
                        x2={coords.x2} y2={coords.y2}
                        stroke="transparent"
                        strokeWidth={10}
                      />

                      {/* Segment 1: from_table end to midpoint */}
                      {fromPart === "total" ? (
                        <>
                          <line 
                            x1={coords.x1 - px * 1.5} y1={coords.y1 - py * 1.5}
                            x2={xMid - px * 1.5} y2={yMid - py * 1.5}
                            stroke={isHovered ? "#a78bfa" : "#8b5cf6"}
                            strokeWidth={isHovered ? 1.8 : 1.0}
                          />
                          <line 
                            x1={coords.x1 + px * 1.5} y1={coords.y1 + py * 1.5}
                            x2={xMid + px * 1.5} y2={yMid + py * 1.5}
                            stroke={isHovered ? "#a78bfa" : "#8b5cf6"}
                            strokeWidth={isHovered ? 1.8 : 1.0}
                          />
                        </>
                      ) : (
                        <line 
                          x1={coords.x1} y1={coords.y1}
                          x2={xMid} y2={yMid}
                          stroke={isHovered ? "#a78bfa" : "#8b5cf6"}
                          strokeWidth={isHovered ? 2.5 : 1.5}
                          strokeDasharray="4, 4"
                        />
                      )}

                      {/* Segment 2: midpoint to to_table end */}
                      {toPart === "total" ? (
                        <>
                          <line 
                            x1={xMid - px * 1.5} y1={yMid - py * 1.5}
                            x2={coords.x2 - px * 1.5} y2={coords.y2 - py * 1.5}
                            stroke={isHovered ? "#a78bfa" : "#8b5cf6"}
                            strokeWidth={isHovered ? 1.8 : 1.0}
                          />
                          <line 
                            x1={xMid + px * 1.5} y1={yMid + py * 1.5}
                            x2={coords.x2 + px * 1.5} y2={coords.y2 + py * 1.5}
                            stroke={isHovered ? "#a78bfa" : "#8b5cf6"}
                            strokeWidth={isHovered ? 1.8 : 1.0}
                          />
                        </>
                      ) : (
                        <line 
                          x1={xMid} y1={yMid}
                          x2={coords.x2} y2={coords.y2}
                          stroke={isHovered ? "#a78bfa" : "#8b5cf6"}
                          strokeWidth={isHovered ? 2.5 : 1.5}
                          strokeDasharray="4, 4"
                        />
                      )}

                      {/* Crow's Foot / Tick at from_table end (x1, y1) */}
                      {cardinality === "1:N" || cardinality === "N:M" ? (
                        /* Crow's Foot */
                        <>
                          <line 
                            x1={coords.x1 - uy * 5} y1={coords.y1 + ux * 5}
                            x2={coords.x1 + ux * 10} y2={coords.y1 + uy * 10}
                            stroke="#8b5cf6"
                            strokeWidth={1.5}
                          />
                          <line 
                            x1={coords.x1 + uy * 5} y1={coords.y1 - ux * 5}
                            x2={coords.x1 + ux * 10} y2={coords.y1 + uy * 10}
                            stroke="#8b5cf6"
                            strokeWidth={1.5}
                          />
                        </>
                      ) : (
                        /* Single Tick */
                        <line 
                          x1={coords.x1 + ux * 6 - uy * 5} y1={coords.y1 + uy * 6 + ux * 5}
                          x2={coords.x1 + ux * 6 + uy * 5} y2={coords.y1 + uy * 6 - ux * 5}
                          stroke="#8b5cf6"
                          strokeWidth={1.5}
                        />
                      )}

                      {/* Crow's Foot / Tick at to_table end (x2, y2) */}
                      {cardinality === "N:M" ? (
                        /* Crow's Foot */
                        <>
                          <line 
                            x1={coords.x2 + uy * 5} y1={coords.y2 - ux * 5}
                            x2={coords.x2 - ux * 10} y2={coords.y2 - uy * 10}
                            stroke="#8b5cf6"
                            strokeWidth={1.5}
                          />
                          <line 
                            x1={coords.x2 - uy * 5} y1={coords.y2 + ux * 5}
                            x2={coords.x2 - ux * 10} y2={coords.y2 - uy * 10}
                            stroke="#8b5cf6"
                            strokeWidth={1.5}
                          />
                        </>
                      ) : (
                        /* Single Tick */
                        <line 
                          x1={coords.x2 - ux * 6 - uy * 5} y1={coords.y2 - uy * 6 + ux * 5}
                          x2={coords.x2 - ux * 6 + uy * 5} y2={coords.y2 - uy * 6 - ux * 5}
                          stroke="#8b5cf6"
                          strokeWidth={1.5}
                        />
                      )}
                    </>
                  )}

                  {/* Midpoint label overlay */}
                  {rel.relationship_name && (
                    <g transform={`translate(${xMid}, ${yMid})`} pointerEvents="none">
                      <rect 
                        x={-(rel.relationship_name.length * 5 + 8) / 2} 
                        y={-9} 
                        width={rel.relationship_name.length * 5 + 8} 
                        height={18} 
                        rx={6} 
                        fill="var(--surface-elevated)" 
                        stroke="var(--border-color)" 
                        strokeWidth={1}
                      />
                      <text 
                        textAnchor="middle" 
                        y={3}
                        fontSize={10} 
                        fontStyle="italic" 
                        fill="#9ca3af"
                        fontFamily="var(--font-sans)"
                      >
                        {rel.relationship_name}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Table Boxes */}
            {schemaInfo.tables.map((tbl) => {
              const pos = positions[tbl.name] || { x: 50, y: 50 };
              const width = 170;
              const height = 110;
              
              return (
                <g key={tbl.name} transform={`translate(${pos.x}, ${pos.y})`}>
                  {/* Outer rect */}
                  <rect 
                    width={width}
                    height={height}
                    rx={8}
                    fill="var(--surface-elevated)"
                    stroke="#8b5cf6"
                    strokeWidth={1.2}
                    filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.4))"
                  />
                  
                  {/* Header rect */}
                  <rect 
                    width={width}
                    height={26}
                    rx={8}
                    fill="#2d1b69"
                    clipPath="inset(0px 0px 84px 0px)"
                  />
                  
                  {/* Header divider */}
                  <line x1={0} y1={26} x2={width} y2={26} stroke="#8b5cf6" strokeWidth={1} />

                  {/* Header text */}
                  <text 
                    x={width / 2} y={17}
                    fill="#f9fafb"
                    fontSize={11}
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="var(--font-sans)"
                  >
                    {tbl.name} ({tbl.row_count})
                  </text>

                  {/* Columns list */}
                  {tbl.columns.slice(0, 5).map((col, cIdx) => {
                    const isPK = col.is_primary_key;
                    const isFK = col.is_foreign_key;
                    
                    return (
                      <g key={col.name} transform={`translate(10, ${42 + cIdx * 13})`}>
                        {/* Key icon / label prefix */}
                        <text 
                          x={0} y={0}
                          fontSize={9}
                          fill={isPK ? "#f59e0b" : (isFK ? "#8b5cf6" : "transparent")}
                          fontFamily="var(--font-sans)"
                        >
                          {isPK ? "🔑" : (isFK ? "🔗" : "")}
                        </text>

                        {/* Column Name */}
                        <text 
                          x={12} y={0}
                          fontSize={9.5}
                          fill={isPK ? "#f9fafb" : (isFK ? "#a78bfa" : "var(--text-secondary)")}
                          fontWeight={isPK || isFK ? "600" : "400"}
                          fontFamily="var(--font-mono)"
                        >
                          {col.name.length > 18 ? col.name.slice(0, 16) + ".." : col.name}
                        </text>
                      </g>
                    );
                  })}
                  
                  {/* Overflow indicator if table has > 5 columns */}
                  {tbl.columns.length > 5 && (
                    <text 
                      x={width / 2} y={105}
                      fill="var(--text-muted)"
                      fontSize={8}
                      textAnchor="middle"
                      fontStyle="italic"
                      fontFamily="var(--font-sans)"
                    >
                      + {tbl.columns.length - 5} more columns
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* ERD Legend Box */}
        <div 
          style={{
            marginTop: "16px",
            backgroundColor: "#1a1025",
            border: "1px solid #2c2c2c",
            borderRadius: "6px",
            padding: "10px 14px",
            fontSize: "11px",
            color: "#f9fafb",
            fontFamily: "var(--font-sans)",
            display: "inline-block"
          }}
        >
          <div style={{ fontWeight: "bold", borderBottom: "1px solid #2c2c2c", paddingBottom: "4px", marginBottom: "6px", color: "#a78bfa" }}>
            ERD Legend
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: "4px 16px", alignItems: "center" }}>
            <span style={{ color: "#8b5cf6", fontWeight: "600" }}>── single tick</span>
            <span>= One (1)</span>
            
            <span style={{ color: "#8b5cf6", fontWeight: "600" }}>══ double line</span>
            <span>= Total participation (mandatory)</span>

            <span style={{ color: "#8b5cf6", fontWeight: "600" }}>──&lt; crow's foot</span>
            <span>= Many (N)</span>
            
            <span style={{ color: "#8b5cf6", fontWeight: "600" }}>╌╌ dashed line</span>
            <span>= Partial participation (optional)</span>
          </div>
        </div>

      </div>

      {/* Tabs and Data Preview Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>Table Data Previews</h3>

        {/* Tab Selection Row */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
          {schemaInfo.tables.map((tbl) => (
            <button
              key={tbl.name}
              onClick={() => setActiveTab(tbl.name)}
              className={`view-tab ${activeTab === tbl.name ? "active" : ""}`}
              style={{
                borderRadius: "4px",
                borderBottom: activeTab === tbl.name ? "2px solid #8b5cf6" : "none",
                color: activeTab === tbl.name ? "#a78bfa" : "var(--text-secondary)"
              }}
            >
              {tbl.name} ({tbl.row_count})
            </button>
          ))}
        </div>

        {/* Preview Data Grid */}
        {activePreview ? (
          <div>
            <DataTable 
              columns={activePreview.columns} 
              rows={activePreview.rows} 
              maxHeight="240px" 
            />
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "8px", textAlign: "right" }}>
              Showing first 5 rows of {activePreview.total_rows} total rows
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", padding: "20px", textAlign: "center" }}>
            No preview rows loaded.
          </div>
        )}
      </div>

      {/* Floating Tooltip */}
      {hoveredRel && (() => {
        const expl = getParticipationExplanation(hoveredRel);
        return (
          <div 
            style={{
              position: "fixed",
              left: mousePos.x + 12,
              top: mousePos.y + 12,
              zIndex: 2000,
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "12px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              pointerEvents: "none",
              maxWidth: "320px",
              fontFamily: "var(--font-sans)",
              lineHeight: "1.4"
            }}
          >
            <div style={{ fontWeight: 700, borderBottom: "1px solid var(--border-color)", paddingBottom: "6px", marginBottom: "6px", color: "#a78bfa" }}>
              <code>{hoveredRel.from_table}</code> &rarr; <code>{hoveredRel.to_table}</code>
            </div>
            <div style={{ marginBottom: "6px" }}>
              <strong>Cardinality:</strong> <span style={{ color: "#a78bfa", fontWeight: 600 }}>{hoveredRel.cardinality || "1:N"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", color: "var(--text-secondary)" }}>
              <div>• {expl.fromText}</div>
              <div>• {expl.toText}</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
