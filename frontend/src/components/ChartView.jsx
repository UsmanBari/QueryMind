import React, { useState, useEffect, useMemo } from "react";

// Helper checking if >80% of values are numbers
export function isNumeric(values) {
  if (!values || values.length === 0) return false;
  const numCount = values.filter(v => typeof v === "number" && !isNaN(v)).length;
  return (numCount / values.length) > 0.8;
}

// Helper checking if >80% of values match YYYY-MM-DD format
export function looksLikeDate(values) {
  if (!values || values.length === 0) return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}/;
  const dateCount = values.filter(v => typeof v === "string" && dateRegex.test(v)).length;
  return (dateCount / values.length) > 0.8;
}

export default function ChartView({ result }) {
  const [mounted, setMounted] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, [result]);

  const chartMeta = useMemo(() => {
    if (!result || !result.results || !result.results.columns || !result.results.rows || result.results.rows.length === 0) {
      return null;
    }

    const columns = result.results.columns;
    const rows = result.results.rows;

    let chartType = null;
    let xIdx = 0;
    let yIdx = 1;

    // Detect column roles
    if (columns.length >= 2) {
      const col1Values = rows.map(r => r[0]);
      const col2Values = rows.map(r => r[1]);

      const col1IsNumeric = isNumeric(col1Values);
      const col2IsNumeric = isNumeric(col2Values);
      const col1IsDate = looksLikeDate(col1Values);

      if (!col1IsNumeric && col2IsNumeric) {
        xIdx = 0;
        yIdx = 1;
        if (col1IsDate) {
          chartType = "LINE";
        } else if (rows.length <= 6) {
          chartType = "PIE";
        } else {
          chartType = "BAR";
        }
      } else if (col1IsNumeric && !col2IsNumeric) {
        xIdx = 1;
        yIdx = 0;
        const col2IsDate = looksLikeDate(col2Values);
        if (col2IsDate) {
          chartType = "LINE";
        } else if (rows.length <= 6) {
          chartType = "PIE";
        } else {
          chartType = "BAR";
        }
      } else if (columns.length >= 3) {
        // 3+ columns. Look for first text/date and first numeric
        let foundX = -1;
        let foundY = -1;
        for (let i = 0; i < columns.length; i++) {
          const vals = rows.map(r => r[i]);
          if (isNumeric(vals)) {
            if (foundY === -1) foundY = i;
          } else {
            if (foundX === -1) foundX = i;
          }
        }
        if (foundX !== -1 && foundY !== -1) {
          xIdx = foundX;
          yIdx = foundY;
          chartType = "BAR";
        }
      }
    }

    if (!chartType) return null;

    // Format data points (limit to first 20 rows for layout readability)
    const points = rows.slice(0, 20).map((row, idx) => {
      const rawX = row[xIdx];
      const rawY = row[yIdx];
      return {
        xVal: rawX === null || rawX === undefined ? "NULL" : String(rawX),
        yVal: Number(rawY || 0),
        originalRowIdx: idx
      };
    });

    return {
      chartType,
      points,
      xLabel: columns[xIdx],
      yLabel: columns[yIdx],
      totalCount: rows.length
    };
  }, [result]);

  if (!chartMeta) {
    return (
      <div 
        className="chart-container" 
        style={{ 
          display: "flex", 
          flexDirection: "column", 
          justifyContent: "center", 
          alignItems: "center", 
          height: "220px", 
          backgroundColor: "#161616", 
          border: "1px solid var(--border-color)", 
          borderRadius: "8px",
          color: "var(--text-secondary)"
        }}
      >
        <div style={{ backgroundColor: "#1e1e1e", padding: "12px", borderRadius: "50%", marginBottom: "12px" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-primary)" }}>Chart not available for this query type.</span>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>View data in the Table tab.</span>
      </div>
    );
  }

  const { chartType, points, xLabel, yLabel, totalCount } = chartMeta;

  // Format large numbers cleanly
  const formatNumber = (num) => {
    if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    if (num % 1 !== 0) return num.toFixed(2);
    return num.toString();
  };

  // --- 1. BAR CHART RENDERER ---
  if (chartType === "BAR") {
    const svgWidth = 600;
    const svgHeight = 350;
    const padding = { top: 40, right: 30, bottom: 60, left: 65 };
    const graphWidth = svgWidth - padding.left - padding.right;
    const graphHeight = svgHeight - padding.top - padding.bottom;

    const yValues = points.map(p => p.yVal);
    const maxY = Math.max(...yValues, 0);
    const minY = Math.min(...yValues, 0);
    const upperLimit = maxY === 0 ? 10 : maxY * 1.15; // 15% top padding

    // Grid ticks (5 marks)
    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }).map((_, i) => {
      const val = (upperLimit / tickCount) * i;
      const y = padding.top + graphHeight - (val / upperLimit) * graphHeight;
      return { val, y };
    });

    const colWidth = graphWidth / points.length;
    const barPadding = 0.35;
    const barWidth = colWidth * (1 - barPadding);
    const barOffset = colWidth * (barPadding / 2);

    return (
      <div className="chart-container" style={{ height: "360px", padding: "10px" }}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%">
          {/* Grid lines */}
          {ticks.map((t, idx) => (
            <g key={idx}>
              <line x1={padding.left} y1={t.y} x2={svgWidth - padding.right} y2={t.y} stroke="#2c2c2c" strokeDasharray="3,3" />
              <text x={padding.left - 10} y={t.y + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="10" fontFamily="var(--font-sans)">
                {formatNumber(t.val)}
              </text>
            </g>
          ))}

          {/* Bars */}
          {points.map((pt, idx) => {
            const x = padding.left + idx * colWidth + barOffset;
            const barHeightVal = (pt.yVal / upperLimit) * graphHeight;
            
            // Mount animation height
            const animatedHeight = mounted ? barHeightVal : 0;
            const y = padding.top + graphHeight - animatedHeight;

            // Shorten label
            const displayLabel = pt.xVal.length > 10 ? pt.xVal.substring(0, 10) + "..." : pt.xVal;
            const isHovered = hoveredIdx === idx;

            return (
              <g 
                key={idx} 
                onMouseEnter={() => setHoveredIdx(idx)} 
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(animatedHeight, 1)}
                  rx="3"
                  fill={isHovered ? "#60a5fa" : "#3b82f6"}
                  style={{ transition: "height 0.4s ease-out, y 0.4s ease-out, fill 0.2s" }}
                />
                
                {/* Label on top of bar */}
                {mounted && isHovered && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fontSize="10"
                    fontWeight="bold"
                  >
                    {pt.yVal.toLocaleString()}
                  </text>
                )}

                {/* X axis labels (slanted for readability) */}
                <text
                  x={x + barWidth / 2}
                  y={padding.top + graphHeight + 15}
                  textAnchor="end"
                  fill="var(--text-secondary)"
                  fontSize="9"
                  fontFamily="var(--font-sans)"
                  transform={`rotate(-25, ${x + barWidth / 2}, ${padding.top + graphHeight + 15})`}
                >
                  {displayLabel}
                </text>
              </g>
            );
          })}

          {/* Axis lines */}
          <line x1={padding.left} y1={padding.top + graphHeight} x2={svgWidth - padding.right} y2={padding.top + graphHeight} stroke="#2c2c2c" strokeWidth="1.5" />
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + graphHeight} stroke="#2c2c2c" strokeWidth="1.5" />

          {/* Title labels */}
          <text x={svgWidth / 2} y={18} textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="600">
            {yLabel} by {xLabel} {totalCount > 20 && <tspan fill="var(--text-muted)" fontSize="10">(first 20 rows)</tspan>}
          </text>
        </svg>
      </div>
    );
  }

  // --- 2. LINE CHART RENDERER ---
  if (chartType === "LINE") {
    const svgWidth = 600;
    const svgHeight = 350;
    const padding = { top: 40, right: 40, bottom: 50, left: 65 };
    const graphWidth = svgWidth - padding.left - padding.right;
    const graphHeight = svgHeight - padding.top - padding.bottom;

    const yValues = points.map(p => p.yVal);
    const maxY = Math.max(...yValues, 0);
    const upperLimit = maxY === 0 ? 10 : maxY * 1.15;

    // Grid ticks (5 marks)
    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }).map((_, i) => {
      const val = (upperLimit / tickCount) * i;
      const y = padding.top + graphHeight - (val / upperLimit) * graphHeight;
      return { val, y };
    });

    // Compute coordinates
    const segmentWidth = graphWidth / Math.max(points.length - 1, 1);
    const coords = points.map((pt, idx) => {
      const x = padding.left + idx * segmentWidth;
      const y = padding.top + graphHeight - (pt.yVal / upperLimit) * graphHeight;
      return { x, y, pt, idx };
    });

    // Generate polyline string points
    const polylinePoints = coords.map(c => `${c.x},${c.y}`).join(" ");

    // Generate gradient fill area path points
    const areaPath = coords.length > 0 
      ? `M ${coords[0].x},${padding.top + graphHeight} ` + 
        coords.map(c => `L ${c.x},${c.y}`).join(" ") + 
        ` L ${coords[coords.length - 1].x},${padding.top + graphHeight} Z`
      : "";

    return (
      <div className="chart-container" style={{ height: "360px", padding: "10px" }}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%">
          <defs>
            <linearGradient id="blue-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {ticks.map((t, idx) => (
            <g key={idx}>
              <line x1={padding.left} y1={t.y} x2={svgWidth - padding.right} y2={t.y} stroke="#2c2c2c" strokeDasharray="3,3" />
              <text x={padding.left - 10} y={t.y + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="10" fontFamily="var(--font-sans)">
                {formatNumber(t.val)}
              </text>
            </g>
          ))}

          {/* Area under the line */}
          {mounted && areaPath && (
            <path d={areaPath} fill="url(#blue-gradient)" style={{ transition: "all 0.5s ease-out" }} />
          )}

          {/* Line string */}
          {mounted && polylinePoints && (
            <polyline
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
              points={polylinePoints}
              style={{ strokeDasharray: "1000", strokeDashoffset: mounted ? "0" : "1000", transition: "stroke-dashoffset 1s ease-out" }}
            />
          )}

          {/* Vertical crosshair on hover */}
          {hoveredIdx !== null && coords[hoveredIdx] && (
            <g>
              <line
                x1={coords[hoveredIdx].x}
                y1={padding.top}
                x2={coords[hoveredIdx].x}
                y2={padding.top + graphHeight}
                stroke="#60a5fa"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              {/* Tooltip */}
              <rect
                x={Math.max(coords[hoveredIdx].x - 65, padding.left)}
                y={Math.max(coords[hoveredIdx].y - 45, 10)}
                width="130"
                height="32"
                rx="4"
                fill="#1f1f1f"
                stroke="#3b82f6"
                strokeWidth="1"
              />
              <text
                x={Math.max(coords[hoveredIdx].x, padding.left + 65)}
                y={Math.max(coords[hoveredIdx].y - 32, 23)}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize="9"
                fontWeight="bold"
              >
                {coords[hoveredIdx].pt.xVal}
              </text>
              <text
                x={Math.max(coords[hoveredIdx].x, padding.left + 65)}
                y={Math.max(coords[hoveredIdx].y - 20, 35)}
                textAnchor="middle"
                fill="#3b82f6"
                fontSize="9"
                fontWeight="bold"
              >
                {coords[hoveredIdx].pt.yVal.toLocaleString()}
              </text>
            </g>
          )}

          {/* Data point dots and hover trigger zones */}
          {coords.map((c, idx) => (
            <g key={idx}>
              <circle cx={c.x} cy={c.y} r="4" fill="#3b82f6" stroke="#0d0d0d" strokeWidth="1" />
              {/* Invisible large target for easier hover */}
              <circle
                cx={c.x}
                cy={c.y}
                r="16"
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />

              {/* X axis labels (limited spacing) */}
              {(points.length < 8 || idx % 2 === 0) && (
                <text
                  x={c.x}
                  y={padding.top + graphHeight + 16}
                  textAnchor="middle"
                  fill="var(--text-secondary)"
                  fontSize="9"
                  fontFamily="var(--font-sans)"
                >
                  {c.pt.xVal}
                </text>
              )}
            </g>
          ))}

          {/* Axis lines */}
          <line x1={padding.left} y1={padding.top + graphHeight} x2={svgWidth - padding.right} y2={padding.top + graphHeight} stroke="#2c2c2c" strokeWidth="1.5" />
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + graphHeight} stroke="#2c2c2c" strokeWidth="1.5" />

          {/* Title labels */}
          <text x={svgWidth / 2} y={18} textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="600">
            {yLabel} trend over {xLabel} {totalCount > 20 && <tspan fill="var(--text-muted)" fontSize="10">(first 20 rows)</tspan>}
          </text>
        </svg>
      </div>
    );
  }

  // --- 3. PIE CHART RENDERER ---
  if (chartType === "PIE") {
    const svgWidth = 400;
    const svgHeight = 300;
    const cx = 130;
    const cy = 150;
    const r = 95;
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

    const yValues = points.map(p => p.yVal);
    const sum = yValues.reduce((a, b) => a + b, 0);

    let currentAngle = -Math.PI / 2; // Start at 12 o'clock

    const slices = points.map((pt, idx) => {
      const val = pt.yVal;
      const pct = sum === 0 ? 0 : val / sum;
      const angle = pct * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const midAngle = (startAngle + endAngle) / 2;
      return {
        pt,
        pct,
        startAngle,
        endAngle,
        midAngle,
        color: colors[idx % colors.length],
        idx
      };
    });

    return (
      <div className="chart-container" style={{ height: "320px", padding: "10px" }}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%">
          {/* Slices */}
          {sum > 0 ? (
            slices.map((slice, idx) => {
              const x1 = cx + r * Math.cos(slice.startAngle);
              const y1 = cy + r * Math.sin(slice.startAngle);
              const x2 = cx + r * Math.cos(slice.endAngle);
              const y2 = cy + r * Math.sin(slice.endAngle);

              const largeArcFlag = slice.pct > 0.5 ? 1 : 0;
              const isHovered = hoveredIdx === idx;

              // Arc path: Move to center, Line to start boundary, Arc to end boundary, close path
              let d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

              if (slice.pct >= 0.999) {
                // Draw a circle if single slice dominates
                d = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
              }

              // Displace slice on hover
              const dx = isHovered ? 8 * Math.cos(slice.midAngle) : 0;
              const dy = isHovered ? 8 * Math.sin(slice.midAngle) : 0;

              return (
                <path
                  key={idx}
                  d={d}
                  fill={slice.color}
                  stroke="#0d0d0d"
                  strokeWidth="1.5"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{
                    transform: `translate(${dx}px, ${dy}px)`,
                    transition: "transform 0.2s ease-out",
                    cursor: "pointer"
                  }}
                />
              );
            })
          ) : (
            <circle cx={cx} cy={cy} r={r} fill="#2c2c2c" />
          )}

          {/* Legend keys on the right */}
          <g transform="translate(255, 60)">
            {slices.map((slice, idx) => {
              const displayLabel = slice.pt.xVal.length > 12 
                ? slice.pt.xVal.substring(0, 12) + "..." 
                : slice.pt.xVal;
              const pctText = (slice.pct * 100).toFixed(1) + "%";
              const isHovered = hoveredIdx === idx;

              return (
                <g 
                  key={idx} 
                  transform={`translate(0, ${idx * 22})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <circle cx="5" cy="5" r="5" fill={slice.color} />
                  <text
                    x="16"
                    y="9"
                    fill={isHovered ? "var(--text-primary)" : "var(--text-secondary)"}
                    fontSize="10.5"
                    fontFamily="var(--font-sans)"
                    fontWeight={isHovered ? "bold" : "normal"}
                  >
                    {displayLabel} ({pctText})
                  </text>
                </g>
              );
            })}
          </g>

          {/* Title labels */}
          <text x={svgWidth / 2} y={22} textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="600">
            {yLabel} share by {xLabel}
          </text>
        </svg>
      </div>
    );
  }

  return null;
}
