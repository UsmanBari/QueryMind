import os
import sqlite3
import re
import time
import pandas as pd
from typing import Dict, Any
from backend import config

class SQLService:
    def __init__(self):
        print("[SQLService] Initializing SQLService singleton...")

    def validate_sql(self, sql: str) -> bool:
        """
        Validates that the SQL query is a SELECT statement and does not contain
        forbidden modifying operations like INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, EXEC.
        """
        print(f"[SQLService] Validating SQL: {sql}")
        try:
            if not sql or not isinstance(sql, str):
                return False

            sql_upper = sql.upper().strip()

            # The SQL must be a SELECT statement
            if "SELECT" not in sql_upper:
                print("[SQLService] Validation failed: SQL does not contain SELECT keyword.")
                return False

            # Forbidden keywords pattern with word boundaries to avoid false positives (e.g. column name like 'create_date')
            forbidden_pattern = r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b"
            if re.search(forbidden_pattern, sql_upper):
                print("[SQLService] Validation failed: SQL contains forbidden modifying keywords.")
                return False

            return True
        except Exception as e:
            print(f"[SQLService] Error during SQL validation: {e}")
            return False

    def _clean_query_tsql_artifacts(self, sql: str) -> str:
        """
        Lightweight cleaner that removes accidental T-SQL syntax the LLM might
        hallucinate when generating queries for a schema DB that was originally T-SQL.
        Only applied to SELECT queries.
        """
        cleaned = sql

        # Convert SELECT TOP N ... to SELECT ... LIMIT N
        top_match = re.search(
            r'\bSELECT\s+TOP\s+(\d+)\b',
            cleaned, re.IGNORECASE
        )
        if top_match:
            limit_n = top_match.group(1)
            # Remove TOP N from SELECT
            cleaned = re.sub(r'\bSELECT\s+TOP\s+\d+\b', 'SELECT', cleaned, flags=re.IGNORECASE)
            
            # Check for semicolon at the end
            has_semicolon = cleaned.strip().endswith(';')
            cleaned_body = cleaned.strip()
            if has_semicolon:
                cleaned_body = cleaned_body[:-1].strip()
                
            # Remove any existing LIMIT to avoid duplication
            cleaned_body = re.sub(r'\bLIMIT\s+\d+\s*$', '', cleaned_body, flags=re.IGNORECASE).strip()
            
            # Append LIMIT at the end
            cleaned = f"{cleaned_body} LIMIT {limit_n}"
            if has_semicolon:
                cleaned += ";"

        # Remove WITH (NOLOCK) hints
        cleaned = re.sub(r'\bWITH\s*\(\s*NOLOCK\s*\)', '', cleaned, flags=re.IGNORECASE)

        # Remove square brackets around identifiers: [EMPNO] → EMPNO
        cleaned = re.sub(r'\[([^\]]+)\]', r'\1', cleaned)

        # Clean up any double spaces left behind
        cleaned = re.sub(r'  +', ' ', cleaned).strip()

        return cleaned

    def execute_query(self, db_name: str, sql: str, mode: str = "csv") -> Dict[str, Any]:
        """
        Executes the provided SQL query against the specified SQLite database.
        Validates the SQL first, limits output using pandas, measures execution time,
        and translates SQLite/pandas dtypes to JSON-serializable Python objects.
        """
        print(f"[SQLService] Executing SQL on {db_name}.db (mode={mode}): {sql}")
        try:
            # 1. Validate SQL safety
            if not self.validate_sql(sql):
                raise ValueError("Dangerous or invalid SQL query. Only SELECT queries are allowed.")

            # 1b. Clean any accidental T-SQL artifacts from LLM-generated queries
            if mode == "schema":
                sql = self._clean_query_tsql_artifacts(sql)
                print(f"[SQLService] After T-SQL cleanup: {sql}")

            if mode == "csv":
                db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
            else:
                db_path = os.path.join(config.SCHEMA_DB_DIR, f"{db_name}.db")

            if not os.path.exists(db_path):
                raise FileNotFoundError(f"Database {db_name}.db does not exist.")


            conn = sqlite3.connect(db_path)
            
            # 2. Execute query and measure time
            start_time = time.perf_counter()
            try:
                df = pd.read_sql_query(sql, conn)
            except Exception as sql_err:
                conn.close()
                print(f"[SQLService] SQLite Error: {sql_err}")
                raise ValueError(f"SQLite error: {str(sql_err)}")
            
            execution_time_ms = (time.perf_counter() - start_time) * 1000.0
            conn.close()

            # 3. Limit rows to MAX_ROWS_RETURNED
            df_limited = df.head(config.MAX_ROWS_RETURNED)
            
            # 4. Extract columns and rows, converting numpy/pandas NaN and types to native types
            columns = df_limited.columns.tolist()
            rows = []
            for row in df_limited.itertuples(index=False):
                clean_row = []
                for val in row:
                    if pd.isna(val):
                        clean_row.append(None)
                    elif hasattr(val, "item") and not isinstance(val, (str, bytes)):
                        # Convert numpy/pandas numeric scalars to Python scalars
                        clean_row.append(val.item())
                    else:
                        clean_row.append(val)
                rows.append(clean_row)

            result = {
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "execution_time_ms": round(execution_time_ms, 2)
            }
            print(f"[SQLService] Query execution succeeded. Returned {result['row_count']} rows in {result['execution_time_ms']} ms.")
            return result

        except Exception as e:
            print(f"[SQLService] Error during SQL execution: {e}")
            raise ValueError(str(e))

# Singleton instance
sql_service = SQLService()
