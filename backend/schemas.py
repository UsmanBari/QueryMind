import re
from pydantic import BaseModel, Field, field_validator
from typing import List, Any

# 1. Models for GET /datasets
class DatasetInfo(BaseModel):
    db_name: str
    display_name: str
    description: str
    columns: List[str]
    row_count: int
    is_sample: bool

class DatasetsResponse(BaseModel):
    datasets: List[DatasetInfo]
    total: int

# 2. Models for GET /datasets/{db_name}/schema
class ColumnDetail(BaseModel):
    name: str
    type: str
    sample_values: List[Any]

class DatasetSchemaResponse(BaseModel):
    db_name: str
    table_name: str
    columns: List[ColumnDetail]
    row_count: int

# 3. Model for POST /upload
class UploadResponse(BaseModel):
    success: bool
    db_name: str
    display_name: str
    columns: List[str]
    row_count: int
    message: str

# 4. Model for DELETE /datasets/{db_name}
class DeleteResponse(BaseModel):
    success: bool
    message: str

# 5. Models for POST /query
class SQLResults(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    row_count: int
    execution_time_ms: float

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=300)
    db_name: str

    @field_validator("db_name")
    @classmethod
    def validate_db_name(cls, v: str) -> str:
        # Enforce that db_name must only contain alphanumeric characters and underscores
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("db_name must only contain alphanumeric characters and underscores")
        return v

class QueryResponse(BaseModel):
    question: str
    sql: str
    results: SQLResults
    insight: str
    retries: int
    db_name: str

# 6. Model for GET /health
class HealthResponse(BaseModel):
    status: str
    groq_configured: bool
    datasets_loaded: int
    sample_datasets: List[str]

# Schemas for new Suggestions and History endpoints
class SuggestionsResponse(BaseModel):
    db_name: str
    suggestions: List[str]

class QueryHistoryItem(BaseModel):
    question: str
    sql: str
    insight: str
    timestamp: str
    row_count: int

class QueryHistoryResponse(BaseModel):
    db_name: str
    history: List[QueryHistoryItem]
    total: int

# 7. Models for Schema/Relational databases
class SchemaRelationship(BaseModel):
    from_table: str
    from_column: str
    to_table: str
    to_column: str
    cardinality: Any = None
    from_participation: Any = None
    to_participation: Any = None
    relationship_name: Any = None

class SchemaDatasetInfo(BaseModel):
    db_name: str
    display_name: str
    description: str
    mode: str = "schema"
    is_sample: bool
    total_tables: int
    total_rows: int
    tables: List[str]
    relationships: List[SchemaRelationship]

class SchemaDatasetsResponse(BaseModel):
    datasets: List[SchemaDatasetInfo]
    total: int

class SchemaColumnDetail(BaseModel):
    name: str
    type: str
    is_primary_key: bool
    is_foreign_key: bool
    references_table: Any = None
    references_column: Any = None
    sample_values: List[Any] = []

class SchemaTableDetail(BaseModel):
    name: str
    columns: List[SchemaColumnDetail]
    row_count: int

class SchemaInfoResponse(BaseModel):
    db_name: str
    mode: str = "schema"
    tables: List[SchemaTableDetail]
    relationships: List[SchemaRelationship]
    total_tables: int
    total_rows: int

class TablePreviewItem(BaseModel):
    table_name: str
    columns: List[str]
    rows: List[List[Any]]
    total_rows: int

class SchemaPreviewsResponse(BaseModel):
    db_name: str
    previews: List[TablePreviewItem]

class SchemaQueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=300)
    db_name: str

    @field_validator("db_name")
    @classmethod
    def validate_db_name(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("db_name must only contain alphanumeric characters and underscores")
        return v

class SchemaQueryResponse(BaseModel):
    question: str
    sql: str
    mode: str = "schema"
    results: SQLResults
    insight: str
    tables_used: List[str]
    retries: int
    db_name: str

class SchemaUploadResponse(BaseModel):
    success: bool
    db_name: str
    mode: str = "schema"
    total_tables: int
    total_rows: int
    tables: List[str]
    relationships: List[SchemaRelationship]
    message: str


