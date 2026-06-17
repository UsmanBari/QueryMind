import os
import re
import time
from datetime import datetime
from collections import defaultdict
from fastapi import FastAPI, HTTPException, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any

from backend import config
from backend.services import csv_service, sql_service, llm_service, insight_service
from backend.services.schema_service import schema_service
from backend.schemas import (
    DatasetsResponse, DatasetInfo, DatasetSchemaResponse, ColumnDetail,
    UploadResponse, DeleteResponse, QueryRequest, QueryResponse, SQLResults,
    HealthResponse, SuggestionsResponse, QueryHistoryResponse, QueryHistoryItem,
    SchemaDatasetsResponse, SchemaUploadResponse, SchemaInfoResponse,
    SchemaPreviewsResponse, SchemaQueryResponse, SchemaQueryRequest
)


# Global in-memory caches
query_histories = defaultdict(list)  # db_name -> list of dicts
suggestions_cache = {}              # db_name -> list of strings

app = FastAPI(
    title="Natural Language Data Analyst API",
    description="Backend API for Natural Language Data Analyst application",
    version="0.1.0"
)

# Enforce CORS allowing all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time"]  # Make sure the frontend can read this header
)

def validate_db_name(db_name: str):
    """
    Validates that db_name only contains alphanumeric characters and underscores.
    Prevents path traversal and injection.
    """
    if not re.match(r"^[a-zA-Z0-9_]+$", db_name):
        raise HTTPException(
            status_code=400,
            detail="db_name must only contain alphanumeric characters and underscores."
        )

# 1. GET /datasets
@app.get("/datasets", response_model=DatasetsResponse)
def get_datasets():
    print("[API] GET /datasets called")
    try:
        # Load sample datasets first
        samples = csv_service.get_sample_datasets()
        sample_names = {ds["name"] for ds in samples}

        datasets_list = []
        # Append sample datasets mapped to output schema
        for ds in samples:
            datasets_list.append(
                DatasetInfo(
                    db_name=ds["name"],
                    display_name=ds["display_name"],
                    description=ds["description"],
                    columns=[col["name"] for col in ds["columns"]],
                    row_count=ds["row_count"],
                    is_sample=True
                )
            )

        # Scan databases/ directory for any user uploaded ones
        if os.path.exists(config.DB_DIR):
            for filename in os.listdir(config.DB_DIR):
                if filename.endswith(".db"):
                    db_name = os.path.splitext(filename)[0]
                    if db_name not in sample_names:
                        try:
                            schema = csv_service.get_table_schema(db_name)
                            datasets_list.append(
                                DatasetInfo(
                                    db_name=db_name,
                                    display_name=db_name.replace("_", " ").capitalize(),
                                    description=f"User-uploaded dataset from {db_name}.csv",
                                    columns=[col["name"] for col in schema["columns"]],
                                    row_count=schema["row_count"],
                                    is_sample=False
                                )
                            )
                        except Exception as e:
                            print(f"[API] Error reading user DB '{db_name}': {e}")

        return DatasetsResponse(datasets=datasets_list, total=len(datasets_list))
    except Exception as e:
        print(f"[API] Error in GET /datasets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch datasets: {str(e)}")

# 2. GET /datasets/{db_name}/schema
@app.get("/datasets/{db_name}/schema", response_model=DatasetSchemaResponse)
def get_dataset_schema(db_name: str):
    print(f"[API] GET /datasets/{db_name}/schema called")
    validate_db_name(db_name)

    db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    try:
        schema = csv_service.get_table_schema(db_name)
        return DatasetSchemaResponse(
            db_name=db_name,
            table_name=schema["table_name"],
            columns=[
                ColumnDetail(
                    name=col["name"],
                    type=col["type"],
                    sample_values=col["sample_values"]
                ) for col in schema["columns"]
            ],
            row_count=schema["row_count"]
        )
    except Exception as e:
        print(f"[API] Error fetching schema for '{db_name}': {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 3. POST /upload
@app.post("/upload", response_model=UploadResponse)
def upload_csv(file: UploadFile = File(...)):
    print(f"[API] POST /upload called with file: {file.filename}")
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are allowed.")

    # Sanitize file name to produce db_name
    base_name = os.path.splitext(file.filename)[0].lower().replace(" ", "_")
    db_name = re.sub(r"[^a-zA-Z0-9_]", "", base_name)
    if not db_name:
        raise HTTPException(status_code=400, detail="Invalid filename characters.")

    db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
    if os.path.exists(db_path):
        raise HTTPException(status_code=409, detail="Dataset already uploaded. Delete it first.")

    # Save to temp location in DB_DIR
    temp_path = os.path.join(config.DB_DIR, f"temp_{db_name}.csv")
    try:
        with open(temp_path, "wb") as buffer:
            buffer.write(file.file.read())
        
        # Load CSV to SQLite database
        schema_info = csv_service.load_csv_to_sqlite(temp_path, db_name)
        
        display_name = db_name.replace("_", " ").capitalize()
        columns = [col["name"] for col in schema_info["columns"]]
        
        return UploadResponse(
            success=True,
            db_name=db_name,
            display_name=display_name,
            columns=columns,
            row_count=schema_info["row_count"],
            message=f"Dataset '{display_name}' uploaded and processed successfully."
        )
    except Exception as e:
        print(f"[API] Error uploading CSV: {e}")
        # If database was created but failed load, clean it up
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Failed to process CSV file: {str(e)}")
    finally:
        # Cleanup temporary CSV file
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                print(f"[API] Failed to delete temp file '{temp_path}': {e}")

# 4. DELETE /datasets/{db_name}
@app.delete("/datasets/{db_name}", response_model=DeleteResponse)
def delete_dataset(db_name: str):
    print(f"[API] DELETE /datasets/{db_name} called")
    validate_db_name(db_name)

    if db_name in ["sales", "employees", "ecommerce"]:
        raise HTTPException(status_code=403, detail="Cannot delete sample datasets.")

    db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    try:
        os.remove(db_path)
        return DeleteResponse(
            success=True,
            message=f"Dataset '{db_name}' deleted successfully."
        )
    except Exception as e:
        print(f"[API] Error deleting dataset '{db_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete dataset: {str(e)}")

# 5. POST /query
@app.post("/query", response_model=QueryResponse)
def run_query(request: QueryRequest, response: Response):
    print(f"[API] POST /query called for db: {request.db_name}, question: '{request.question}'")
    start_time = time.perf_counter()
    
    db_path = os.path.join(config.DB_DIR, f"{request.db_name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail=f"Database '{request.db_name}' not found.")

    try:
        # a. Get schema
        schema = csv_service.get_table_schema(request.db_name)

        # b. Generate SQL
        generation = llm_service.generate_sql(request.question, schema)
        sql = generation["sql"]

        # c. Validate SQL
        if not sql_service.validate_sql(sql):
            raise HTTPException(
                status_code=400,
                detail="Dangerous or invalid SQL query generated. Only SELECT operations are allowed."
            )

        # d. Execute SQL with auto-retry
        retries = 0
        results = None
        current_sql = sql
        last_error = ""

        while True:
            try:
                results = sql_service.execute_query(request.db_name, current_sql)
                # Success, break loop
                break
            except Exception as e:
                last_error = str(e)
                print(f"[API] Query execution failed: {last_error}")
                
                if retries < config.MAX_SQL_RETRIES:
                    retries += 1
                    print(f"[API] Retrying query fix (Attempt {retries}/{config.MAX_SQL_RETRIES})...")
                    try:
                        fix_result = llm_service.fix_sql(current_sql, last_error, schema)
                        fixed_sql = fix_result["sql"]
                        
                        # Validate fixed SQL
                        if not sql_service.validate_sql(fixed_sql):
                            raise ValueError("Fixed SQL failed validation check.")
                        
                        current_sql = fixed_sql
                    except Exception as fix_err:
                        print(f"[API] Failed to generate/validate fix: {fix_err}")
                        # Keep the loop going, next attempts might fix it or we exit with retries exceeded
                else:
                    # Retries exceeded
                    print("[API] Maximum SQL retries exceeded. Aborting.")
                    raise HTTPException(
                        status_code=422,
                        detail=f"SQL execution failed after {config.MAX_SQL_RETRIES} retries. Last error: {last_error}"
                    )

        # e. Generate insight
        insight = insight_service.generate_insight(request.question, current_sql, results)

        # f. Calculate processing time and inject header
        process_time_ms = (time.perf_counter() - start_time) * 1000.0
        response.headers["X-Process-Time"] = f"{process_time_ms:.2f}ms"
        print(f"[API] Request processed in {process_time_ms:.2f}ms. Header added.")

        # Save to query history
        query_histories[request.db_name].append({
            "question": request.question,
            "sql": current_sql,
            "insight": insight,
            "timestamp": datetime.now().isoformat(),
            "row_count": results["row_count"]
        })
        if len(query_histories[request.db_name]) > 20:
            query_histories[request.db_name] = query_histories[request.db_name][-20:]

        return QueryResponse(
            question=request.question,
            sql=current_sql,
            results=SQLResults(
                columns=results["columns"],
                rows=results["rows"],
                row_count=results["row_count"],
                execution_time_ms=results["execution_time_ms"]
            ),
            insight=insight,
            retries=retries,
            db_name=request.db_name
        )

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[API] Internal error in /query pipeline: {e}")
        raise HTTPException(status_code=500, detail=f"Internal pipeline error: {str(e)}")

# 6. GET /datasets/{db_name}/preview
@app.get("/datasets/{db_name}/preview", response_model=SQLResults)
def preview_dataset(db_name: str):
    print(f"[API] GET /datasets/{db_name}/preview called")
    validate_db_name(db_name)

    db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    try:
        preview_sql = "SELECT * FROM data LIMIT 10"
        results = sql_service.execute_query(db_name, preview_sql)
        return SQLResults(
            columns=results["columns"],
            rows=results["rows"],
            row_count=results["row_count"],
            execution_time_ms=results["execution_time_ms"]
        )
    except Exception as e:
        print(f"[API] Error in preview for '{db_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate preview: {str(e)}")

# 7. GET /health
@app.get("/health", response_model=HealthResponse)
def health_check():
    print("[API] GET /health called")
    groq_configured = bool(config.GROQ_API_KEY)
    
    db_dir_accessible = False
    datasets_loaded = 0
    if os.path.exists(config.DB_DIR):
        db_dir_accessible = os.access(config.DB_DIR, os.R_OK | os.W_OK)
        try:
            datasets_loaded = len([f for f in os.listdir(config.DB_DIR) if f.endswith(".db")])
        except Exception:
            pass

    status = "healthy" if (groq_configured and db_dir_accessible) else "unhealthy"

    return HealthResponse(
        status=status,
        groq_configured=groq_configured,
        datasets_loaded=datasets_loaded,
        sample_datasets=["sales", "employees", "ecommerce"]
    )

# 8. GET /datasets/{db_name}/suggestions
@app.get("/datasets/{db_name}/suggestions", response_model=SuggestionsResponse)
def get_dataset_suggestions(db_name: str):
    print(f"[API] GET /datasets/{db_name}/suggestions called")
    validate_db_name(db_name)

    db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    # Check cache first
    if db_name in suggestions_cache:
        print(f"[API] Suggestions cache hit for '{db_name}'")
        return SuggestionsResponse(db_name=db_name, suggestions=suggestions_cache[db_name])

    try:
        # Retrieve table schema
        schema = csv_service.get_table_schema(db_name)
        # Generate question suggestions
        suggestions = llm_service.generate_question_suggestions(schema)
        # Store in cache
        suggestions_cache[db_name] = suggestions
        
        return SuggestionsResponse(db_name=db_name, suggestions=suggestions)
    except Exception as e:
        print(f"[API] Error generating suggestions for '{db_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate suggestions: {str(e)}")

# 9. GET /query/history
@app.get("/query/history", response_model=QueryHistoryResponse)
def get_query_history(db_name: str):
    print(f"[API] GET /query/history called for '{db_name}'")
    validate_db_name(db_name)
    
    db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
    is_schema = False
    if not os.path.exists(db_path):
        schema_db_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.db")
        if os.path.exists(schema_db_path):
            is_schema = True
            db_path = schema_db_path

    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    history_key = f"schema_{db_name}" if is_schema else db_name
    history_list = query_histories.get(history_key, [])
    # Map raw history dict items to QueryHistoryItem
    items = [
        QueryHistoryItem(
            question=h["question"],
            sql=h["sql"],
            insight=h["insight"],
            timestamp=h["timestamp"],
            row_count=h["row_count"]
        ) for h in history_list
    ]
    # Return in reverse chronological order (latest queries first)
    items.reverse()

    return QueryHistoryResponse(
        db_name=db_name,
        history=items,
        total=len(items)
    )

# 10. GET /schema-datasets
@app.get("/schema-datasets", response_model=SchemaDatasetsResponse)
def get_schema_datasets():
    print("[API] GET /schema-datasets called")
    try:
        datasets_list = schema_service.get_all_schema_datasets()
        return SchemaDatasetsResponse(datasets=datasets_list, total=len(datasets_list))
    except Exception as e:
        print(f"[API] Error in GET /schema-datasets: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 11. POST /upload/schema
@app.post("/upload/schema", response_model=SchemaUploadResponse)
def upload_schema_db(
    schema_file: UploadFile = File(None),
    db_file: UploadFile = File(None),
    erd_image: UploadFile = File(None)
):
    schema_fn = schema_file.filename if schema_file else "None"
    db_fn = db_file.filename if db_file else "None"
    erd_fn = erd_image.filename if erd_image else "None"
    print(f"[API] POST /upload/schema called with schema: {schema_fn}, db: {db_fn}, erd_image: {erd_fn}")
    
    if not schema_file and not erd_image:
        raise HTTPException(
            status_code=400,
            detail="Please provide either a .sql schema file or an ERD diagram image"
        )
        
    if schema_file and not schema_file.filename.endswith(".sql"):
        raise HTTPException(status_code=400, detail="Schema file must have a .sql extension.")
        
    if erd_image:
        ext = os.path.splitext(erd_image.filename)[1].lower()
        if ext not in (".png", ".jpg", ".jpeg", ".pdf"):
            raise HTTPException(
                status_code=400,
                detail="ERD image must be a .png, .jpg, .jpeg, or .pdf file."
            )
            
    if db_file and not db_file.filename.endswith((".db", ".sqlite")):
        raise HTTPException(status_code=400, detail="Database file must have a .db or .sqlite extension.")
        
    try:
        # Determine db_name from the uploaded db file or fall back to the schema file name
        if db_file:
            base_name = os.path.splitext(db_file.filename)[0].lower().replace(" ", "_")
        elif schema_file:
            base_name = os.path.splitext(schema_file.filename)[0].lower().replace(" ", "_")
            # Strip common suffixes like _schema, _ddl
            for suffix in ["_schema", "_ddl", "_create", "_tables"]:
                if base_name.endswith(suffix):
                    base_name = base_name[:-len(suffix)]
                    break
        else:
            base_name = "uploaded_db"
        db_name = re.sub(r"[^a-zA-Z0-9_]", "", base_name)
        if not db_name:
            raise HTTPException(status_code=400, detail="Invalid filename characters.")
            
        db_dest_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.db")
        if os.path.exists(db_dest_path):
            raise HTTPException(status_code=409, detail="Database dataset already uploaded. Delete it first.")
            
        # Save uploaded db to a temporary file (if provided)
        temp_db_path = None
        if db_file:
            temp_db_path = os.path.join(config.SCHEMA_DB_DIR, f"temp_{db_name}.db")
            with open(temp_db_path, "wb") as buffer:
                buffer.write(db_file.file.read())
            
        # Optional sql content
        schema_content = None
        if schema_file:
            schema_content = schema_file.file.read().decode("utf-8")
            
        # Optional image path
        temp_img_path = None
        if erd_image:
            ext = os.path.splitext(erd_image.filename)[1].lower()
            temp_img_path = os.path.join(config.SCHEMA_DB_DIR, f"temp_{db_name}{ext}")
            with open(temp_img_path, "wb") as buffer:
                buffer.write(erd_image.file.read())
                
        # Register schema db (uploaded_db_path may be None if building from SQL)
        info = schema_service.register_schema_db(
            db_name=db_name,
            schema_sql_content=schema_content,
            uploaded_db_path=temp_db_path,
            erd_image_path=temp_img_path
        )
        
        # Validation check: at least 2 tables detected after cleaning
        if info["total_tables"] < 2:
            try:
                db_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.db")
                sql_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.sql")
                json_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.json")
                for p in [db_path, sql_path, json_path]:
                    if os.path.exists(p):
                        os.remove(p)
            except Exception:
                pass
            raise HTTPException(
                status_code=400,
                detail="Validation failed: At least 2 tables must be detected in the schema."
            )
        
        # Clean up temp db and image
        if temp_db_path and os.path.exists(temp_db_path):
            try:
                os.remove(temp_db_path)
            except Exception:
                pass
        if temp_img_path and os.path.exists(temp_img_path):
            try:
                os.remove(temp_img_path)
            except Exception:
                pass
                
        return SchemaUploadResponse(
            success=True,
            db_name=db_name,
            total_tables=info["total_tables"],
            total_rows=info["total_rows"],
            tables=[t["name"] for t in info["tables"]],
            relationships=info["relationships"],
            message="Schema database registered successfully"
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[API] Error in POST /upload/schema: {e}")
        # Clean up temp files on error
        if 'temp_db_path' in locals() and temp_db_path and os.path.exists(temp_db_path):
            try:
                os.remove(temp_db_path)
            except Exception:
                pass
        if 'temp_img_path' in locals() and temp_img_path and os.path.exists(temp_img_path):
            try:
                os.remove(temp_img_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))

# 12. GET /schema-datasets/{db_name}/schema
@app.get("/schema-datasets/{db_name}/schema", response_model=SchemaInfoResponse)
def get_schema_details(db_name: str):
    print(f"[API] GET /schema-datasets/{db_name}/schema called")
    validate_db_name(db_name)
    
    try:
        info = schema_service.get_schema_db_info(db_name)
        return SchemaInfoResponse(
            db_name=db_name,
            tables=info["tables"],
            relationships=info["relationships"],
            total_tables=info["total_tables"],
            total_rows=info["total_rows"]
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Schema dataset not found.")
    except Exception as e:
        print(f"[API] Error in GET schema details for '{db_name}': {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 13. GET /schema-datasets/{db_name}/preview
@app.get("/schema-datasets/{db_name}/preview", response_model=SchemaPreviewsResponse)
def get_schema_preview(db_name: str):
    print(f"[API] GET /schema-datasets/{db_name}/preview called")
    validate_db_name(db_name)
    
    try:
        info = schema_service.get_schema_db_info(db_name)
        previews = []
        
        for tbl in info["tables"]:
            tbl_name = tbl["name"]
            preview_sql = f"SELECT * FROM {tbl_name} LIMIT 5"
            results = sql_service.execute_query(db_name, preview_sql, mode="schema")
            previews.append({
                "table_name": tbl_name,
                "columns": results["columns"],
                "rows": results["rows"],
                "total_rows": tbl["row_count"]
            })
            
        return SchemaPreviewsResponse(db_name=db_name, previews=previews)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Schema dataset not found.")
    except Exception as e:
        print(f"[API] Error in GET schema preview for '{db_name}': {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 14. POST /schema-query
@app.post("/schema-query", response_model=SchemaQueryResponse)
def run_schema_query(request: SchemaQueryRequest, response: Response):
    print(f"[API] POST /schema-query called for db: {request.db_name}, question: '{request.question}'")
    start_time = time.perf_counter()
    
    db_path = os.path.join(config.SCHEMA_DB_DIR, f"{request.db_name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail=f"Database '{request.db_name}' not found.")
        
    try:
        # a. Get schema info
        schema_info = schema_service.get_schema_db_info(request.db_name)
        known_tables = [t["name"] for t in schema_info["tables"]]
        
        # b. Generate SQL
        generation = llm_service.generate_sql_schema(request.question, schema_info)
        sql = generation["sql"]
        
        # c. Validate SQL
        if not sql_service.validate_sql(sql):
            raise HTTPException(
                status_code=400,
                detail="Dangerous or invalid SQL query generated. Only SELECT operations are allowed."
            )
            
        # d. Execute query with auto-retry
        retries = 0
        results = None
        current_sql = sql
        last_error = ""
        
        while True:
            try:
                results = sql_service.execute_query(request.db_name, current_sql, mode="schema")
                break
            except Exception as e:
                last_error = str(e)
                print(f"[API] Schema Query execution failed: {last_error}")
                
                if retries < config.MAX_SQL_RETRIES:
                    retries += 1
                    print(f"[API] Retrying query fix (Attempt {retries}/{config.MAX_SQL_RETRIES})...")
                    try:
                        fix_result = llm_service.fix_sql_schema(current_sql, last_error, schema_info)
                        fixed_sql = fix_result["sql"]
                        
                        if not sql_service.validate_sql(fixed_sql):
                            raise ValueError("Fixed SQL failed validation check.")
                        current_sql = fixed_sql
                    except Exception as fix_err:
                        print(f"[API] Failed to generate/validate fix: {fix_err}")
                else:
                    print("[API] Maximum SQL retries exceeded in schema mode. Aborting.")
                    raise HTTPException(
                        status_code=422,
                        detail=f"SQL execution failed after {config.MAX_SQL_RETRIES} retries. Last error: {last_error}"
                    )
                    
        # e. Generate insight
        insight = insight_service.generate_insight(request.question, current_sql, results)
        
        # f. Process time header
        process_time_ms = (time.perf_counter() - start_time) * 1000.0
        response.headers["X-Process-Time"] = f"{process_time_ms:.2f}ms"
        
        # g. Parse tables_used
        matches = re.findall(r"\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)", current_sql, re.IGNORECASE)
        tables_used = []
        for m in matches:
            tbl = m.lower().strip()
            if tbl in known_tables and tbl not in tables_used:
                tables_used.append(tbl)
                
        # Save to query history
        query_histories[f"schema_{request.db_name}"].append({
            "question": request.question,
            "sql": current_sql,
            "insight": insight,
            "timestamp": datetime.now().isoformat(),
            "row_count": results["row_count"]
        })
        if len(query_histories[f"schema_{request.db_name}"]) > 20:
            query_histories[f"schema_{request.db_name}"] = query_histories[f"schema_{request.db_name}"][-20:]
            
        return SchemaQueryResponse(
            question=request.question,
            sql=current_sql,
            results=SQLResults(
                columns=results["columns"],
                rows=results["rows"],
                row_count=results["row_count"],
                execution_time_ms=results["execution_time_ms"]
            ),
            insight=insight,
            tables_used=tables_used,
            retries=retries,
            db_name=request.db_name
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[API] Error in run_schema_query: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 15. DELETE /schema-datasets/{db_name}
@app.delete("/schema-datasets/{db_name}", response_model=DeleteResponse)
def delete_schema_dataset(db_name: str):
    print(f"[API] DELETE /schema-datasets/{db_name} called")
    validate_db_name(db_name)
    
    if db_name == "ecommerce":
        raise HTTPException(status_code=403, detail="Cannot delete sample datasets.")
        
    db_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.db")
    sql_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.sql")
    
    if not os.path.exists(db_path) or not os.path.exists(sql_path):
        raise HTTPException(status_code=404, detail="Schema dataset not found.")
        
    try:
        os.remove(db_path)
        os.remove(sql_path)
        json_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.json")
        if os.path.exists(json_path):
            os.remove(json_path)
        return DeleteResponse(
            success=True,
            message=f"Schema dataset '{db_name}' deleted successfully."
        )
    except Exception as e:
        print(f"[API] Error deleting schema dataset '{db_name}': {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

