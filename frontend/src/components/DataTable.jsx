import React from "react";

export default function DataTable({ columns, rows, maxHeight }) {
  if (!columns || columns.length === 0) {
    return <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "10px" }}>No data columns.</div>;
  }

  const isNumeric = (val) => {
    return typeof val === "number" && !isNaN(val);
  };

  return (
    <div 
      className="table-container" 
      style={maxHeight ? { maxHeight: maxHeight } : {}}
    >
      <table className="table-preview">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={idx}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows && rows.length > 0 ? (
            rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => {
                  const numeric = isNumeric(cell);
                  return (
                    <td 
                      key={cellIdx}
                      className={`cell-mono ${numeric ? "cell-numeric" : "cell-text"}`}
                    >
                      {cell === null || cell === undefined ? (
                        <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.75rem" }}>
                          NULL
                        </span>
                      ) : typeof cell === "boolean" ? (
                        cell.toString().toUpperCase()
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td 
                colSpan={columns.length} 
                style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px" }}
              >
                No records returned.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
