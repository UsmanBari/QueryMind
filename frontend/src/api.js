const BASE_URL = "http://localhost:8000";

/**
 * Helper to process fetch responses, parsing JSON and raising errors with detailed messages if available.
 */
async function handleResponse(response) {
  if (!response.ok) {
    let errMsg = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data && data.detail) {
        if (typeof data.detail === "string") {
          errMsg = data.detail;
        } else if (Array.isArray(data.detail)) {
          // Parse FastAPI validation errors
          errMsg = data.detail.map(err => `${err.loc.join(".")}: ${err.msg}`).join(", ");
        }
      }
    } catch (e) {
      // Fallback to text if parsing fails
      try {
        const text = await response.text();
        if (text) errMsg = text;
      } catch (innerErr) {}
    }
    throw new Error(errMsg);
  }
  
  // Return parsed data and preserve headers if needed
  const jsonData = await response.json();
  
  // If we have custom headers like X-Process-Time, we can attach it to the returned data structure
  if (response.headers.has("X-Process-Time")) {
    jsonData._processTime = response.headers.get("X-Process-Time");
  }
  return jsonData;
}

export async function getDatasets() {
  console.log("[API] Fetching datasets...");
  const response = await fetch(`${BASE_URL}/datasets`);
  return handleResponse(response);
}

export async function getSchema(dbName) {
  console.log(`[API] Fetching schema for database: ${dbName}...`);
  const response = await fetch(`${BASE_URL}/datasets/${encodeURIComponent(dbName)}/schema`);
  return handleResponse(response);
}

export async function getPreview(dbName) {
  console.log(`[API] Fetching preview for database: ${dbName}...`);
  const response = await fetch(`${BASE_URL}/datasets/${encodeURIComponent(dbName)}/preview`);
  return handleResponse(response);
}

export async function uploadCSV(file) {
  console.log(`[API] Uploading CSV file: ${file.name}...`);
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    body: formData
    // Note: Do not set Content-Type header manually. The browser will auto-set it with boundary.
  });
  return handleResponse(response);
}

export async function deleteDataset(dbName) {
  console.log(`[API] Deleting database: ${dbName}...`);
  const response = await fetch(`${BASE_URL}/datasets/${encodeURIComponent(dbName)}`, {
    method: "DELETE"
  });
  return handleResponse(response);
}

export async function queryDataset(question, dbName) {
  console.log(`[API] Querying database: ${dbName} with question: '${question}'...`);
  const response = await fetch(`${BASE_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question, db_name: dbName })
  });
  return handleResponse(response);
}

export async function getSuggestions(dbName) {
  console.log(`[API] Fetching suggestions for database: ${dbName}...`);
  const response = await fetch(`${BASE_URL}/datasets/${encodeURIComponent(dbName)}/suggestions`);
  return handleResponse(response);
}

export async function getQueryHistory(dbName) {
  console.log(`[API] Fetching history for database: ${dbName}...`);
  const response = await fetch(`${BASE_URL}/query/history?db_name=${encodeURIComponent(dbName)}`);
  return handleResponse(response);
}

export async function getSchemaDatasets() {
  console.log("[API] Fetching schema datasets...");
  const response = await fetch(`${BASE_URL}/schema-datasets`);
  return handleResponse(response);
}

export async function getSchemaInfo(dbName) {
  console.log(`[API] Fetching schema details for database: ${dbName}...`);
  const response = await fetch(`${BASE_URL}/schema-datasets/${encodeURIComponent(dbName)}/schema`);
  return handleResponse(response);
}

export async function getSchemaPreview(dbName) {
  console.log(`[API] Fetching schema preview for database: ${dbName}...`);
  const response = await fetch(`${BASE_URL}/schema-datasets/${encodeURIComponent(dbName)}/preview`);
  return handleResponse(response);
}

export async function uploadSchemaDB(sqlFile, erdImage = null) {
  console.log(`[API] Uploading schema files...`);
  const formData = new FormData();
  if (sqlFile) {
    formData.append("schema_file", sqlFile);
  }
  if (erdImage) {
    formData.append("erd_image", erdImage);
  }
  
  const response = await fetch(`${BASE_URL}/upload/schema`, {
    method: "POST",
    body: formData
  });
  return handleResponse(response);
}

export async function deleteSchemaDataset(dbName) {
  console.log(`[API] Deleting schema database: ${dbName}...`);
  const response = await fetch(`${BASE_URL}/schema-datasets/${encodeURIComponent(dbName)}`, {
    method: "DELETE"
  });
  return handleResponse(response);
}

export async function querySchema(question, dbName) {
  console.log(`[API] Querying schema database: ${dbName} with question: '${question}'...`);
  const response = await fetch(`${BASE_URL}/schema-query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question, db_name: dbName })
  });
  return handleResponse(response);
}


