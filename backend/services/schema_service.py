import os
import re
import sqlite3
import shutil
import base64
import mimetypes
import json
from typing import Dict, Any, List
from groq import Groq
from backend import config

class SchemaService:
    def __init__(self):
        print("[SchemaService] Initializing SchemaService singleton...")
        os.makedirs(config.SCHEMA_DB_DIR, exist_ok=True)

    def clean_tsql_to_sqlite(self, raw_sql: str) -> tuple:
        """
        Takes a raw SQL script (possibly T-SQL / SQL Server syntax) and returns
        a clean SQLite-compatible SQL string plus any extra relationships extracted
        from ALTER TABLE statements.

        Returns:
            tuple: (cleaned_sql: str, extra_relationships: list)
        """
        print("[SchemaService] Running T-SQL to SQLite conversion...")
        
        # Normalize line endings
        sql = raw_sql.replace('\r\n', '\n')
        
        # Remove comments containing T-SQL specific syntax hints
        sql = re.sub(r'/\*[^*]*(?:WITH\s*\(\s*NOLOCK\s*\)|NOLOCK)[^*]*\*/', '', sql, flags=re.IGNORECASE)
        
        # STEP 1 — Remove SQL Server specific statements entirely
        # Remove IF NOT EXISTS ... BEGIN ... END blocks (multi-line, non-greedy)
        sql = re.sub(
            r'(?smi)\bIF\s+NOT\s+EXISTS\s*\(.*?\)\s*BEGIN\s*.*?END\s*;?',
            '', sql
        )
        
        # Remove IF OBJECT_ID(...) IS NOT NULL DROP TABLE ... blocks
        sql = re.sub(
            r'(?smi)\bIF\s+OBJECT_ID\s*\(.*?\)\s+IS\s+NOT\s+NULL\s+DROP\s+TABLE\s+[^;\n]+;?',
            '', sql
        )
        
        # Remove other IF EXISTS ... BEGIN ... END blocks
        sql = re.sub(
            r'(?smi)\bIF\s+EXISTS\s*\(.*?\)\s*BEGIN\s*.*?END\s*;?',
            '', sql
        )
        
        # Remove lines containing specific SQL Server statements entirely
        lines = sql.split('\n')
        cleaned_lines = []
        for line in lines:
            stripped = line.strip().upper()
            
            # Skip GO batch separator
            if stripped == 'GO' or stripped == 'GO;':
                continue
            # Skip PRINT statements
            if 'PRINT' in stripped:
                continue
            # Skip USE statements
            if 'USE ' in stripped or re.search(r'\bUSE\b', stripped):
                continue
            # Skip lines referencing system objects
            if any(kw in stripped for kw in ['SYS.TABLES', 'SYS.DATABASES', 'SYS.OBJECTS']):
                continue
            # Skip OBJECT_ID references
            if 'OBJECT_ID(' in stripped:
                continue
            # Skip SET NOCOUNT, SET ANSI, SET QUOTED
            if any(kw in stripped for kw in ['SET NOCOUNT', 'SET ANSI', 'SET QUOTED']):
                continue
            # Skip EXEC / EXECUTE statements
            if 'EXEC' in re.findall(r'\bEXEC\b', stripped) or 'EXECUTE' in re.findall(r'\bEXECUTE\b', stripped):
                continue
                
            # Remove WITH (NOLOCK) hints inline (keep the rest of the line)
            line = re.sub(r'\bWITH\s*\(\s*NOLOCK\s*\)', '', line, flags=re.IGNORECASE)
            cleaned_lines.append(line)
            
        sql = '\n'.join(cleaned_lines)
        
        # Let's split into statements by semicolon, clean each, and rejoin
        statements = re.split(r';', sql)
        cleaned_statements = []
        extra_relationships = []
        
        # ALTER TABLE foreign key constraint pattern
        alter_fk_pattern = re.compile(
            r'ALTER\s+TABLE\s+(\w+)\s+ADD\s+CONSTRAINT\s+\w+\s+'
            r'FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s*'
            r'REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)',
            re.IGNORECASE | re.DOTALL
        )
        
        # Helper to clean CHECK constraints that reference T-SQL functions or subqueries
        def clean_check_constraints(sql_chunk: str) -> str:
            pos = 0
            while True:
                match = re.search(r'\bCHECK\b', sql_chunk[pos:], re.IGNORECASE)
                if not match:
                    break
                start_idx = pos + match.start()
                open_paren_idx = sql_chunk.find('(', start_idx)
                if open_paren_idx == -1:
                    pos = start_idx + 5
                    continue
                paren_depth = 0
                close_paren_idx = -1
                for i in range(open_paren_idx, len(sql_chunk)):
                    if sql_chunk[i] == '(':
                        paren_depth += 1
                    elif sql_chunk[i] == ')':
                        paren_depth -= 1
                        if paren_depth == 0:
                            close_paren_idx = i
                            break
                if close_paren_idx == -1:
                    pos = start_idx + 5
                    continue
                
                check_expr = sql_chunk[start_idx:close_paren_idx + 1]
                if any(kw in check_expr.upper() for kw in ['GETDATE', 'SYSDATETIME', 'GETUTCDATE', 'NEWID', 'SELECT']):
                    # Remove the CHECK expression
                    sql_chunk = sql_chunk[:start_idx] + sql_chunk[close_paren_idx + 1:]
                    pos = start_idx
                else:
                    pos = close_paren_idx + 1
            return sql_chunk

        for stmt in statements:
            stmt = stmt.strip()
            if not stmt:
                continue
                
            # If it's just comments, keep it as is
            lines_only = re.sub(r'--.*$', '', stmt, flags=re.MULTILINE).strip()
            lines_only = re.sub(r'/\*.*?\*/', '', lines_only, flags=re.DOTALL).strip()
            if not lines_only:
                cleaned_statements.append(stmt + ';')
                continue
                
            # Discard statement if it contains leftovers from line removal or system tables
            stmt_upper = stmt.upper()
            if any(kw in stmt_upper for kw in ['SYS.TABLES', 'SYS.DATABASES', 'SYS.OBJECTS', 'OBJECT_ID(']):
                continue
            if stmt_upper.startswith('SELECT') and 'FROM' not in stmt_upper:
                continue
                
            # STEP 6 — Handle schema prefixes and brackets (run early so ALTER TABLE matches clean names)
            stmt = re.sub(r'\[dbo\]\.\[([^\]]+)\]', r'\1', stmt, flags=re.IGNORECASE)
            stmt = re.sub(r'\bdbo\.\[([^\]]+)\]', r'\1', stmt, flags=re.IGNORECASE)
            stmt = re.sub(r'\[dbo\]\.(\w+)', r'\1', stmt, flags=re.IGNORECASE)
            stmt = re.sub(r'\bdbo\.(\w+)', r'\1', stmt, flags=re.IGNORECASE)
            stmt = re.sub(r'\[([^\]]+)\]', r'\1', stmt)
            
            # STEP 3 — Handle ALTER TABLE ADD CONSTRAINT FOREIGN KEY statements
            m = alter_fk_pattern.search(stmt)
            if m:
                extra_relationships.append({
                    "from_table": m.group(1).lower(),
                    "from_column": m.group(2).lower(),
                    "to_table": m.group(3).lower(),
                    "to_column": m.group(4).lower(),
                    "source": "alter_table"
                })
                # Skip writing the ALTER TABLE statement
                continue
                
            # Also skip other ALTER TABLE constraints SQLite doesn't support
            if re.search(r'\bALTER\s+TABLE\s+\w+\s+ADD\s+CONSTRAINT\b', stmt, re.IGNORECASE):
                continue
                
            # STEP 2 — Convert data types
            type_map = [
                (r'\bDATETIME2\b', 'TEXT'),
                (r'\bDATETIME\b', 'TEXT'),
                (r'\bSMALLDATETIME\b', 'TEXT'),
                (r'\bNVARCHAR\s*\(\s*MAX\s*\)', 'TEXT'),
                (r'\bVARCHAR\s*\(\s*MAX\s*\)', 'TEXT'),
                (r'\bNVARCHAR\s*\((\s*\d+\s*)\)', r'VARCHAR(\1)'),
                (r'\bNCHAR\s*\((\s*\d+\s*)\)', r'CHAR(\1)'),
                (r'\bNTEXT\b', 'TEXT'),
                (r'\bUNIQUEIDENTIFIER\b', 'TEXT'),
                (r'\bSMALLMONEY\b', 'DECIMAL(6,2)'),
                (r'\bMONEY\b', 'DECIMAL(15,2)'),
                (r'\bTINYINT\b', 'INTEGER'),
                (r'\bSMALLINT\b', 'INTEGER'),
                (r'\bBIGINT\b', 'INTEGER'),
                (r'\bBIT\b', 'INTEGER'),
                (r'\bVARBINARY\s*\([^)]*\)', 'BLOB'),
                (r'\bVARBINARY\b', 'BLOB'),
                (r'\bIMAGE\b', 'BLOB'),
                (r'\bFLOAT\b', 'REAL'),
                (r'\bREAL\b', 'REAL'),
            ]
            for pattern, replacement in type_map:
                stmt = re.sub(pattern, replacement, stmt, flags=re.IGNORECASE)
                
            # STEP 4 — Handle CHECK constraints
            stmt = clean_check_constraints(stmt)
            
            # Clean up commas and spacing inside statement
            # Remove multiple commas: e.g. ", ," to ","
            stmt = re.sub(r',\s*,', ',', stmt)
            # Remove trailing comma before closing parenthesis: e.g. ", )" to ")"
            stmt = re.sub(r',\s*\)', ')', stmt)
            
            stmt = stmt.strip()
            if stmt:
                cleaned_statements.append(stmt + ';')
                
        sql = '\n\n'.join(cleaned_statements)
        
        # Remove multiple consecutive blank lines
        sql = re.sub(r'\n{3,}', '\n\n', sql).strip()
        
        print(f"[SchemaService] T-SQL conversion complete. Extracted {len(extra_relationships)} ALTER TABLE relationships.")
        return (sql, extra_relationships)


    def parse_schema_sql(self, schema_sql_content: str) -> dict:
        """
        Parses the raw DDL schema text using regex to extract all tables, 
        columns, primary keys, and foreign keys.
        """
        print("[SchemaService] Parsing SQL schema content...")
        # 1. Clean the SQL file comments and whitespace
        sql_clean = re.sub(r"--.*?\n", "\n", schema_sql_content)
        sql_clean = re.sub(r"/\*.*?\*/", "", sql_clean, flags=re.DOTALL)
        
        # 2. Match CREATE TABLE statements
        table_matches = re.finditer(r"CREATE\s+TABLE\s+(\w+)\s*\((.*?)\);", sql_clean, re.IGNORECASE | re.DOTALL)
        
        tables = []
        relationships = []
        
        for match in table_matches:
            table_name = match.group(1).lower().strip()
            inner_content = match.group(2).strip()
            
            # Split definitions by comma, ignoring nested commas inside parentheses (e.g. DECIMAL(10,2))
            defs = []
            current = []
            paren_count = 0
            for char in inner_content:
                if char == '(':
                    paren_count += 1
                    current.append(char)
                elif char == ')':
                    paren_count -= 1
                    current.append(char)
                elif char == ',' and paren_count == 0:
                    defs.append("".join(current).strip())
                    current = []
                else:
                    current.append(char)
            if current:
                defs.append("".join(current).strip())
                
            columns = []
            table_fk_constraints = []
            
            for d in defs:
                if not d:
                    continue
                
                # Check if this line is a table-level FOREIGN KEY constraint:
                # e.g., FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
                fk_match = re.search(r"FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s*REFERENCES\s*(\w+)\s*\(\s*(\w+)\s*\)", d, re.IGNORECASE)
                if fk_match:
                    from_col = fk_match.group(1).lower().strip()
                    to_tbl = fk_match.group(2).lower().strip()
                    to_col = fk_match.group(3).lower().strip()
                    table_fk_constraints.append({
                        "from_column": from_col,
                        "to_table": to_tbl,
                        "to_column": to_col
                    })
                    relationships.append({
                        "from_table": table_name,
                        "from_column": from_col,
                        "to_table": to_tbl,
                        "to_column": to_col
                    })
                    continue
                    
                # Check if this line is a table-level PRIMARY KEY constraint:
                pk_match = re.search(r"PRIMARY\s+KEY\s*\(\s*(\w+)\s*\)", d, re.IGNORECASE)
                if pk_match:
                    pk_col = pk_match.group(1).lower().strip()
                    for col in columns:
                        if col["name"] == pk_col:
                            col["is_primary_key"] = True
                    continue
                    
                # Otherwise, it's a column definition
                parts = d.split()
                if not parts:
                    continue
                col_name = parts[0].lower().strip()
                col_name = col_name.strip("`\"'")
                
                col_type = parts[1].upper().strip() if len(parts) > 1 else "TEXT"
                col_type = re.sub(r"\(.*?\)", "", col_type)
                
                is_pk = False
                if "PRIMARY" in d.upper() and "KEY" in d.upper() and "FOREIGN" not in d.upper():
                    is_pk = True
                    
                inline_ref = re.search(r"REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)", d, re.IGNORECASE)
                
                col_info = {
                    "name": col_name,
                    "type": col_type,
                    "is_primary_key": is_pk,
                    "is_foreign_key": False,
                    "references_table": None,
                    "references_column": None,
                    "is_not_null": "NOT NULL" in d.upper() or is_pk
                }
                
                if inline_ref:
                    col_info["is_foreign_key"] = True
                    col_info["references_table"] = inline_ref.group(1).lower().strip()
                    col_info["references_column"] = inline_ref.group(2).lower().strip()
                    relationships.append({
                        "from_table": table_name,
                        "from_column": col_name,
                        "to_table": col_info["references_table"],
                        "to_column": col_info["references_column"]
                    })
                    
                columns.append(col_info)
                
            # Enrich columns with table-level FK constraints
            for fk in table_fk_constraints:
                for col in columns:
                    if col["name"] == fk["from_column"]:
                        col["is_foreign_key"] = True
                        col["references_table"] = fk["to_table"]
                        col["references_column"] = fk["to_column"]
                        
            tables.append({
                "name": table_name,
                "columns": columns
            })
            
        return {
            "tables": tables,
            "relationships": relationships
        }

    def enrich_schema_db(self, db_name: str, schema_info: dict, db_path: str) -> dict:
        """
        Enriches the parsed schema with live table statistics and sample values.
        """
        print(f"[SchemaService] Enriches database '{db_name}' metadata...")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        total_rows = 0
        enriched_tables = []
        
        for tbl in schema_info["tables"]:
            tbl_name = tbl["name"]
            
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {tbl_name}")
                tbl_rows = cursor.fetchone()[0]
            except Exception:
                tbl_rows = 0
            total_rows += tbl_rows
            
            sample_rows = []
            try:
                col_names_str = ", ".join([f'"{col["name"]}"' for col in tbl["columns"]])
                cursor.execute(f"SELECT {col_names_str} FROM {tbl_name} LIMIT 3")
                sample_rows = cursor.fetchall()
            except Exception as e:
                print(f"[SchemaService] Error getting sample rows for {tbl_name}: {e}")
                
            enriched_cols = []
            for col_idx, col in enumerate(tbl["columns"]):
                col_samples = []
                for row in sample_rows:
                    if col_idx < len(row):
                        val = row[col_idx]
                        if val is not None:
                            col_samples.append(val)
                col["sample_values"] = col_samples
                enriched_cols.append(col)
                
            enriched_tables.append({
                "name": tbl_name,
                "columns": enriched_cols,
                "row_count": tbl_rows
            })
            
        conn.close()
        
        return {
            "db_name": db_name,
            "mode": "schema",
            "tables": enriched_tables,
            "relationships": schema_info["relationships"],
            "total_tables": len(enriched_tables),
            "total_rows": total_rows
        }

    def extract_schema_from_erd_image(self, image_path: str) -> dict:
        """
        Extracts database schema from the ERD diagram image using Groq vision API.
        """
        print(f"[SchemaService] Extracting schema from image: {image_path}")
        with open(image_path, "rb") as f:
            base64_image = base64.b64encode(f.read()).decode("utf-8")
            
        mime_type, _ = mimetypes.guess_type(image_path)
        if not mime_type:
            if image_path.lower().endswith(".png"):
                mime_type = "image/png"
            elif image_path.lower().endswith((".jpg", ".jpeg")):
                mime_type = "image/jpeg"
            elif image_path.lower().endswith(".pdf"):
                mime_type = "application/pdf"
            else:
                mime_type = "image/png"
                
        client = Groq(api_key=config.GROQ_API_KEY)
        
        completion = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        },
                        {
                            "type": "text",
                            "text": """Analyze this Entity Relationship Diagram (ERD) carefully.
Extract the complete database schema and return ONLY a JSON object 
with this exact structure, nothing else:
{
  "tables": [
    {
      "name": "table_name",
      "columns": [
        {
          "name": "column_name",
          "type": "TEXT|INTEGER|REAL|BLOB",
          "is_primary_key": true|false,
          "is_foreign_key": false,
          "references_table": null,
          "references_column": null
        }
      ]
    }
  ],
  "relationships": [
    {
      "from_table": "table_a",
      "from_column": "col_a",
      "to_table": "table_b", 
      "to_column": "col_b",
      "cardinality": "1:1|1:N|N:M",
      "from_participation": "total|partial",
      "to_participation": "total|partial",
      "relationship_name": "places|contains|belongs_to|etc"
    }
  ]
}

For cardinality:
- 1:1 means one record in table_a relates to exactly one in table_b
- 1:N means one record in table_a relates to many in table_b
- N:M means many records in table_a relate to many in table_b

For participation:
- total means every record MUST participate (double line in ERD)
- partial means participation is optional (single line in ERD)

Look carefully at crow's foot notation, double lines, dashed lines,
min-max notation, or any other ERD notation style used in the image.
Infer participation and cardinality as accurately as possible."""
                        }
                    ]
                }
            ],
            max_tokens=2000
        )
        
        raw_response = completion.choices[0].message.content.strip()
        cleaned = raw_response
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            content_lines = [line for line in lines if not line.strip().startswith("```")]
            cleaned = "".join(content_lines).strip()
        cleaned = cleaned.strip("`").strip()
        
        json_start = cleaned.find("{")
        json_end = cleaned.rfind("}")
        if json_start != -1 and json_end != -1:
            cleaned = cleaned[json_start:json_end+1]
            
        return json.loads(cleaned)

    def enrich_relationships_from_erd_image(self, existing_schema: dict, image_path: str) -> dict:
        """
        Enriches relationships in existing schema using the ERD diagram image via Groq vision API.
        """
        print(f"[SchemaService] Enriching schema relationships from image: {image_path}")
        with open(image_path, "rb") as f:
            base64_image = base64.b64encode(f.read()).decode("utf-8")
            
        mime_type, _ = mimetypes.guess_type(image_path)
        if not mime_type:
            if image_path.lower().endswith(".png"):
                mime_type = "image/png"
            elif image_path.lower().endswith((".jpg", ".jpeg")):
                mime_type = "image/jpeg"
            elif image_path.lower().endswith(".pdf"):
                mime_type = "application/pdf"
            else:
                mime_type = "image/png"
                
        client = Groq(api_key=config.GROQ_API_KEY)
        
        schema_text = json.dumps(existing_schema, indent=2)
        
        completion = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        },
                        {
                            "type": "text",
                            "text": f"""This ERD diagram corresponds to the following database schema:
{schema_text}

For each relationship shown in this diagram, extract:
- cardinality (1:1, 1:N, or N:M)
- from_participation (total or partial)
- to_participation (total or partial)
- relationship_name (the verb/label on the relationship line if visible)

Return ONLY a JSON array:
[
  {{
    'from_table': '...', 'to_table': '...',
    'cardinality': '1:N',
    'from_participation': 'partial',
    'to_participation': 'total',
    'relationship_name': 'places'
  }}
]"""
                        }
                    ]
                }
            ],
            max_tokens=2000
        )
        
        raw_response = completion.choices[0].message.content.strip()
        cleaned = raw_response
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            content_lines = [line for line in lines if not line.strip().startswith("```")]
            cleaned = "".join(content_lines).strip()
        cleaned = cleaned.strip("`").strip()
        
        json_start = cleaned.find("[")
        json_end = cleaned.rfind("]")
        if json_start != -1 and json_end != -1:
            cleaned = cleaned[json_start:json_end+1]
            
        try:
            enriched_rels = json.loads(cleaned)
        except Exception:
            try:
                import ast
                enriched_rels = ast.literal_eval(cleaned)
            except Exception:
                enriched_rels = []
                
        rel_lookup = {}
        for r in enriched_rels:
            from_t = r.get("from_table", "").lower().strip()
            to_t = r.get("to_table", "").lower().strip()
            rel_lookup[(from_t, to_t)] = r
            
        for rel in existing_schema.get("relationships", []):
            from_t = rel.get("from_table", "").lower().strip()
            to_t = rel.get("to_table", "").lower().strip()
            
            match = rel_lookup.get((from_t, to_t))
            if not match:
                match = rel_lookup.get((to_t, from_t))
                
            if match:
                rel["cardinality"] = match.get("cardinality", "1:N")
                rel["from_participation"] = match.get("from_participation", "total")
                rel["to_participation"] = match.get("to_participation", "partial")
                rel["relationship_name"] = match.get("relationship_name")
            else:
                # Default assumptions
                rel["cardinality"] = "1:N"
                rel["from_participation"] = "total"
                rel["to_participation"] = "partial"
                rel["relationship_name"] = None
                
        return existing_schema

    def infer_cardinality_from_sql(self, relationships: list, tables: list = None) -> list:
        """
        Infers relationship constraints from SQL database schema definition.
        """
        if tables is None:
            tables = []
            
        junction_tables = set()
        for tbl in tables:
            fks = [c for c in tbl.get("columns", []) if c.get("is_foreign_key")]
            if len(fks) >= 2:
                other_cols = [c for c in tbl.get("columns", []) if not c.get("is_foreign_key") and not c.get("is_primary_key") and c.get("name").lower() not in ("id", "created_at", "updated_at", "timestamp")]
                if len(other_cols) <= 1:
                    junction_tables.add(tbl.get("name").lower())
                    
        for rel in relationships:
            from_table = rel.get("from_table", "").lower()
            from_column = rel.get("from_column", "").lower()
            to_table = rel.get("to_table", "").lower()
            to_column = rel.get("to_column", "").lower()
            
            from_tbl_def = next((t for t in tables if t.get("name", "").lower() == from_table), None)
            to_tbl_def = next((t for t in tables if t.get("name", "").lower() == to_table), None)
            
            from_col_def = None
            if from_tbl_def:
                from_col_def = next((c for c in from_tbl_def.get("columns", []) if c.get("name", "").lower() == from_column), None)
                
            to_col_def = None
            if to_tbl_def:
                to_col_def = next((c for c in to_tbl_def.get("columns", []) if c.get("name", "").lower() == to_column), None)
                
            if from_table in junction_tables:
                cardinality = "N:M"
            else:
                is_from_pk = from_col_def.get("is_primary_key", False) if from_col_def else False
                if is_from_pk:
                    is_to_pk = to_col_def.get("is_primary_key", False) if to_col_def else False
                    if is_to_pk:
                        cardinality = "1:1"
                    else:
                        cardinality = "1:N"
                else:
                    cardinality = "1:N"
                    
            to_participation = "partial"
            is_not_null = False
            if from_col_def:
                is_not_null = from_col_def.get("is_primary_key", False) or from_col_def.get("is_not_null", False)
                
            from_participation = "total" if is_not_null else "partial"
            
            rel["cardinality"] = cardinality
            rel["from_participation"] = from_participation
            rel["to_participation"] = to_participation
            rel["relationship_name"] = None
            
        return relationships

    def generate_sql_from_parsed_schema(self, schema_info: dict) -> str:
        """
        Helper to construct a .sql schema file if only the ERD image was uploaded.
        """
        lines = []
        for tbl in schema_info.get("tables", []):
            tbl_name = tbl["name"]
            col_defs = []
            for col in tbl.get("columns", []):
                col_name = col["name"]
                col_type = col.get("type", "TEXT")
                pk_str = " PRIMARY KEY" if col.get("is_primary_key") else ""
                col_defs.append(f"  {col_name} {col_type}{pk_str}")
            
            for col in tbl.get("columns", []):
                if col.get("is_foreign_key") and col.get("references_table") and col.get("references_column"):
                    ref_tbl = col["references_table"]
                    ref_col = col["references_column"]
                    col_defs.append(f"  FOREIGN KEY ({col['name']}) REFERENCES {ref_tbl}({ref_col})")
                    
            lines.append(f"CREATE TABLE {tbl_name} (\n" + ",\n".join(col_defs) + "\n);")
        return "\n\n".join(lines)

    def verify_tables_in_db(self, schema_info: dict, db_path: str):
        """
        Verifies that extracted tables exist in the actual SQLite database.
        """
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        db_tables = {row[0].lower() for row in cursor.fetchall()}
        conn.close()
        
        valid_tables = []
        for tbl in schema_info.get("tables", []):
            tbl_name = tbl["name"].lower()
            if tbl_name in db_tables:
                valid_tables.append(tbl)
            else:
                print(f"[SchemaService] Table '{tbl_name}' extracted from ERD but not found in DB.")
                
        schema_info["tables"] = valid_tables
        valid_table_names = {t["name"].lower() for t in valid_tables}
        valid_rels = []
        for rel in schema_info.get("relationships", []):
            if rel.get("from_table", "").lower() in valid_table_names and rel.get("to_table", "").lower() in valid_table_names:
                valid_rels.append(rel)
        schema_info["relationships"] = valid_rels

    def build_db_from_sql(self, db_name: str, cleaned_sql: str) -> str:
        """
        Creates a new SQLite database from cleaned SQL statements (CREATE TABLE + INSERT INTO).
        Returns the path to the created .db file.
        """
        db_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.db")
        print(f"[SchemaService] Building database from SQL at: {db_path}")
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Split by semicolons and execute each statement individually
        statements = cleaned_sql.split(';')
        executed = 0
        failed = 0
        
        for stmt in statements:
            stmt = stmt.strip()
            if not stmt:
                continue
            # Skip pure comments
            lines_only = re.sub(r'--.*$', '', stmt, flags=re.MULTILINE).strip()
            lines_only = re.sub(r'/\*.*?\*/', '', lines_only, flags=re.DOTALL).strip()
            if not lines_only:
                continue
            try:
                cursor.execute(stmt + ';')
                executed += 1
            except Exception as e:
                failed += 1
                print(f"[SchemaService] Skipped SQL statement (error: {e}): {stmt[:80]}...")
        
        conn.commit()
        conn.close()
        
        print(f"[SchemaService] Database built: {executed} statements executed, {failed} skipped.")
        return db_path

    def register_schema_db(self, db_name: str, schema_sql_content: str = None, uploaded_db_path: str = None, erd_image_path: str = None) -> dict:
        """
        Registers a schema database using uploaded files (.sql, .db, and/or erd_image).
        If uploaded_db_path is None and schema_sql_content is provided, the .db is auto-built from the SQL.
        """
        db_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.db")
        sql_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.sql")
        json_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.json")

        # Clean T-SQL to SQLite before anything else
        extra_relationships = []
        if schema_sql_content:
            schema_sql_content, extra_relationships = self.clean_tsql_to_sqlite(schema_sql_content)

        # If a .db file was uploaded, copy it into place
        if uploaded_db_path:
            if os.path.abspath(uploaded_db_path) != os.path.abspath(db_path):
                shutil.copy2(uploaded_db_path, db_path)
        elif schema_sql_content:
            # No .db uploaded — build it from the cleaned SQL
            db_path = self.build_db_from_sql(db_name, schema_sql_content)
        else:
            raise ValueError("Either a .db file or a .sql file must be provided.")
            
        schema_info = None
        
        if erd_image_path:
            if schema_sql_content:
                parsed_schema = self.parse_schema_sql(schema_sql_content)
                schema_info = self.enrich_relationships_from_erd_image(parsed_schema, erd_image_path)
            else:
                schema_info = self.extract_schema_from_erd_image(erd_image_path)
                self.verify_tables_in_db(schema_info, db_path)
                schema_sql_content = self.generate_sql_from_parsed_schema(schema_info)
        else:
            parsed_schema = self.parse_schema_sql(schema_sql_content)
            parsed_schema["relationships"] = self.infer_cardinality_from_sql(parsed_schema["relationships"], parsed_schema["tables"])
            schema_info = parsed_schema

        # Merge extra_relationships from ALTER TABLE FK statements
        for rel in extra_relationships:
            already_exists = any(
                r["from_table"] == rel["from_table"] and
                r["from_column"] == rel["from_column"]
                for r in schema_info["relationships"]
            )
            if not already_exists:
                # Infer cardinality for the extra relationship
                rel["cardinality"] = "1:N"
                rel["from_participation"] = "partial"
                rel["to_participation"] = "partial"
                rel["relationship_name"] = None
                schema_info["relationships"].append(rel)
                # Also mark the column as a foreign key in the table definition
                for tbl in schema_info.get("tables", []):
                    if tbl["name"] == rel["from_table"]:
                        for col in tbl.get("columns", []):
                            if col["name"] == rel["from_column"]:
                                col["is_foreign_key"] = True
                                col["references_table"] = rel["to_table"]
                                col["references_column"] = rel["to_column"]
            
        with open(sql_path, "w", encoding="utf-8") as f:
            f.write(schema_sql_content)
            
        enriched_info = self.enrich_schema_db(db_name, schema_info, db_path)
        
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(enriched_info, f, indent=2)
            
        return enriched_info

    def get_schema_db_info(self, db_name: str) -> dict:
        """
        Retrieves the structured details of the schema. Reads from json cache if available.
        """
        sql_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.sql")
        db_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.db")
        json_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.json")
        
        if os.path.exists(json_path):
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[SchemaService] Error reading JSON cache: {e}. Falling back.")
                
        if not os.path.exists(sql_path) or not os.path.exists(db_path):
            raise FileNotFoundError(f"Database schema files for '{db_name}' do not exist.")
            
        with open(sql_path, "r", encoding="utf-8") as f:
            schema_sql_content = f.read()
            
        schema_info = self.parse_schema_sql(schema_sql_content)
        schema_info["relationships"] = self.infer_cardinality_from_sql(schema_info["relationships"], schema_info["tables"])
        
        enriched_info = self.enrich_schema_db(db_name, schema_info, db_path)
        
        try:
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(enriched_info, f, indent=2)
        except Exception as e:
            print(f"[SchemaService] Error caching schema JSON: {e}")
            
        return enriched_info

    def get_all_schema_datasets(self) -> List[dict]:
        """
        Lists all schema datasets, checking and initializing the sample e-commerce DB if needed.
        """
        os.makedirs(config.SCHEMA_DB_DIR, exist_ok=True)
        
        sample_db_source = os.path.join(config.SAMPLE_DATA_DIR, "schema", "ecommerce.db")
        sample_sql_source = os.path.join(config.SAMPLE_DATA_DIR, "schema", "ecommerce_schema.sql")
        
        sample_db_dest = os.path.join(config.SCHEMA_DB_DIR, "ecommerce.db")
        sample_sql_dest = os.path.join(config.SCHEMA_DB_DIR, "ecommerce.sql")
        
        if not os.path.exists(sample_db_dest) and os.path.exists(sample_db_source):
            print("[SchemaService] Copying ecommerce sample database to databases/schema/...")
            shutil.copy2(sample_db_source, sample_db_dest)
            if os.path.exists(sample_sql_source):
                shutil.copy2(sample_sql_source, sample_sql_dest)
                
        datasets = []
        for filename in os.listdir(config.SCHEMA_DB_DIR):
            if filename.endswith(".db"):
                db_name = os.path.splitext(filename)[0]
                try:
                    info = self.get_schema_db_info(db_name)
                    datasets.append({
                        "db_name": db_name,
                        "display_name": "E-Commerce Database" if db_name == "ecommerce" else db_name.replace("_", " ").capitalize(),
                        "description": "Relational e-commerce DB: customers, products, orders" if db_name == "ecommerce" else f"User-uploaded schema database: {db_name}",
                        "mode": "schema",
                        "is_sample": (db_name == "ecommerce"),
                        "total_tables": info["total_tables"],
                        "total_rows": info["total_rows"],
                        "tables": [t["name"] for t in info["tables"]],
                        "relationships": info["relationships"]
                    })
                except Exception as e:
                    print(f"[SchemaService] Error loading dataset '{db_name}': {e}")
                    
        return datasets

# Singleton instance
schema_service = SchemaService()
