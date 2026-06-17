import os
import sqlite3
import pandas as pd
from typing import List, Dict, Any
from backend import config

class CSVService:
    def __init__(self):
        print("[CSVService] Initializing CSVService singleton...")
        # Ensure directories exist
        os.makedirs(config.DB_DIR, exist_ok=True)
        os.makedirs(config.SAMPLE_DATA_DIR, exist_ok=True)

    def _infer_column_type(self, series: pd.Series) -> str:
        """
        Helper method to infer SQLite-compatible column types from a pandas Series.
        """
        try:
            # If dtype is numeric, check if integer or float
            if pd.api.types.is_integer_dtype(series):
                return "INTEGER"
            elif pd.api.types.is_float_dtype(series):
                return "REAL"
            
            # Check if it looks like a datetime
            # We try to convert to datetime. If it succeeds without producing more than 10% NaNs (on non-empty series), it's likely a date/time.
            non_null_series = series.dropna()
            if not non_null_series.empty:
                try:
                    converted = pd.to_datetime(non_null_series, errors='coerce')
                    null_pct = converted.isna().sum() / len(non_null_series)
                    if null_pct < 0.1:
                        return "DATE"
                except Exception:
                    pass

            return "TEXT"
        except Exception as e:
            print(f"[CSVService] Error inferring type: {e}. Defaulting to TEXT.")
            return "TEXT"

    def load_csv_to_sqlite(self, file_path: str, db_name: str) -> dict:
        """
        Reads a CSV with pandas, infers column types, creates a SQLite database,
        loads the dataframe into a table named 'data', and returns schema metadata.
        """
        print(f"[CSVService] Loading CSV from {file_path} into database {db_name}.db")
        try:
            # Read CSV
            df = pd.read_csv(file_path)
            
            # Remove any leading/trailing whitespaces in string columns and header names
            df.columns = [col.strip() for col in df.columns]
            for col in df.select_dtypes(include=['object']):
                df[col] = df[col].astype(str).str.strip()

            db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
            conn = sqlite3.connect(db_path)
            
            # Load into SQLite table 'data'
            df.to_sql("data", conn, if_exists="replace", index=False)
            
            # Determine columns metadata
            columns_metadata = []
            for col in df.columns:
                inferred_type = self._infer_column_type(df[col])
                # Convert numpy values to native Python types for JSON serialization
                sample_vals = df[col].dropna().unique()[:3]
                sample_vals_list = []
                for val in sample_vals:
                    if hasattr(val, "item"):
                        sample_vals_list.append(val.item())
                    else:
                        sample_vals_list.append(val)
                
                columns_metadata.append({
                    "name": col,
                    "type": inferred_type,
                    "sample_values": sample_vals_list
                })

            row_count = len(df)
            conn.close()
            
            result = {
                "db_name": db_name,
                "table_name": "data",
                "columns": columns_metadata,
                "row_count": row_count
            }
            print(f"[CSVService] Successfully loaded {row_count} rows into {db_name}.db table 'data'")
            return result

        except Exception as e:
            print(f"[CSVService] Failed to load CSV {file_path} to SQLite: {e}")
            raise ValueError(f"Failed to load CSV to SQLite: {str(e)}")

    def get_table_schema(self, db_name: str) -> dict:
        """
        Connects to db_name.db and retrieves the table 'data' schema details.
        """
        print(f"[CSVService] Retrieving table schema for {db_name}.db")
        try:
            db_path = os.path.join(config.DB_DIR, f"{db_name}.db")
            if not os.path.exists(db_path):
                raise FileNotFoundError(f"Database {db_name}.db does not exist.")

            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Check row count
            cursor.execute("SELECT COUNT(*) FROM data")
            row_count = cursor.fetchone()[0]
            
            # Retrieve table schema info
            cursor.execute("PRAGMA table_info(data)")
            columns_info = cursor.fetchall()
            
            columns = []
            for col_info in columns_info:
                col_name = col_info[1]
                col_type = col_info[2]
                
                # Fetch up to 3 unique non-null sample values from SQLite
                cursor.execute(f'SELECT DISTINCT "{col_name}" FROM data WHERE "{col_name}" IS NOT NULL LIMIT 3')
                sample_vals = [row[0] for row in cursor.fetchall()]
                
                columns.append({
                    "name": col_name,
                    "type": col_type,
                    "sample_values": sample_vals
                })
                
            conn.close()
            
            schema = {
                "table_name": "data",
                "columns": columns,
                "row_count": row_count
            }
            print(f"[CSVService] Retrieved schema for {db_name}.db with {row_count} rows.")
            return schema

        except Exception as e:
            print(f"[CSVService] Failed to retrieve table schema for {db_name}: {e}")
            raise ValueError(f"Failed to retrieve table schema: {str(e)}")

    def get_sample_datasets(self) -> List[dict]:
        """
        Reads all CSVs in sample_data/ folder. Load them to SQLite if not already loaded,
        and returns details of each.
        """
        print("[CSVService] Fetching sample datasets...")
        try:
            datasets = []
            descriptions = {
                "sales": "Monthly sales data across products, regions, and salespeople",
                "employees": "Company HR data with salaries, departments, and performance",
                "ecommerce": "Online store orders with products, customers, and payments"
            }
            
            if not os.path.exists(config.SAMPLE_DATA_DIR):
                print(f"[CSVService] Sample data directory {config.SAMPLE_DATA_DIR} does not exist.")
                return []

            for filename in os.listdir(config.SAMPLE_DATA_DIR):
                if filename.endswith(".csv"):
                    name = os.path.splitext(filename)[0]
                    file_path = os.path.join(config.SAMPLE_DATA_DIR, filename)
                    db_path = os.path.join(config.DB_DIR, f"{name}.db")
                    
                    display_name = name.capitalize()
                    description = descriptions.get(name, f"Sample dataset containing {name} records")
                    
                    # If not already loaded to SQLite, load it
                    if not os.path.exists(db_path):
                        print(f"[CSVService] Pre-loading sample CSV: {filename}")
                        schema_info = self.load_csv_to_sqlite(file_path, name)
                    else:
                        schema_info = self.get_table_schema(name)
                    
                    datasets.append({
                        "name": name,
                        "display_name": display_name,
                        "description": description,
                        "columns": schema_info["columns"],
                        "row_count": schema_info["row_count"]
                    })
                    
            return datasets
        except Exception as e:
            print(f"[CSVService] Failed to fetch sample datasets: {e}")
            raise ValueError(f"Failed to fetch sample datasets: {str(e)}")

# Singleton instance
csv_service = CSVService()
