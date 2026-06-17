import os
from groq import Groq
from typing import Dict, Any
from backend import config

class LLMService:
    def __init__(self):
        print("[LLMService] Initializing LLMService singleton...")
        # Since Groq client requires an API key, we will instantiate it lazily or during init
        # If API key is empty/missing, it will raise an error later when invoked.
        self.client = None

    def _get_client(self) -> Groq:
        if self.client is None:
            if not config.GROQ_API_KEY:
                raise ValueError("Groq API Key is not set in the environment or configuration.")
            self.client = Groq(api_key=config.GROQ_API_KEY)
        return self.client

    def _clean_sql_response(self, response: str) -> str:
        """
        Cleans the raw response from the LLM, stripping markdown code blocks,
        backticks, and any leading/trailing whitespace.
        """
        cleaned = response.strip()
        
        # Strip code blocks starting with ``` (e.g. ```sql or ```)
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            sql_lines = [line for line in lines if not line.strip().startswith("```")]
            cleaned = "\n".join(sql_lines).strip()
            
        # Strip single backticks
        cleaned = cleaned.strip("`").strip()
        
        # Sometimes LLMs add an ending semicolon, which is fine, but let's keep it clean
        return cleaned

    def generate_sql(self, question: str, schema: dict) -> Dict[str, Any]:
        """
        Generates SQLite SELECT query based on the user question and database schema.
        """
        print(f"[LLMService] Generating SQL for question: '{question}'")
        try:
            client = self._get_client()

            # Format the columns section of the prompt
            columns_prompt = []
            for col in schema.get("columns", []):
                name = col.get("name")
                col_type = col.get("type")
                sample_vals = col.get("sample_values", [])
                columns_prompt.append(f"- {name} ({col_type}): examples: {sample_vals}")
            
            columns_str = "\n".join(columns_prompt)

            system_prompt = (
                "You are an expert SQL analyst. Generate SQLite-compatible SELECT queries only.\n"
                "Never use INSERT, UPDATE, DELETE, DROP, or any destructive operations.\n"
                "Always use the exact table name 'data'.\n"
                "For date columns, use SQLite date functions (strftime, date())\n"
                "For aggregations, always include ORDER BY to make results meaningful\n"
                "Limit results to 20 rows maximum unless the question asks for all data\n"
                "Always alias aggregated columns with readable names (e.g. SUM(revenue) AS total_revenue)\n"
                "Return ONLY the SQL query, no explanation, no markdown, no backticks."
            )

            user_prompt = (
                f"Table schema:\n"
                f"Table name: data\n"
                f"Columns:\n"
                f"{columns_str}\n\n"
                f"Question: {question}\n\n"
                f"Write a SQLite SELECT query to answer this question."
            )

            print("[LLMService] Sending generation request to Groq...")
            completion = client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0
            )

            raw_response = completion.choices[0].message.content
            sql = self._clean_sql_response(raw_response)

            print(f"[LLMService] Generated SQL:\n{sql}")
            return {
                "sql": sql,
                "raw_response": raw_response
            }

        except Exception as e:
            print(f"[LLMService] Error generating SQL: {e}")
            raise ValueError(f"Failed to generate SQL: {str(e)}")

    def fix_sql(self, original_sql: str, error: str, schema: dict) -> Dict[str, str]:
        """
        Takes a failed SQL query, the SQLite execution error, and the database schema,
        and requests the LLM to return a corrected query.
        """
        print(f"[LLMService] Fixing SQL query: '{original_sql}' due to error: '{error}'")
        try:
            client = self._get_client()

            # Format the columns section of the prompt
            columns_prompt = []
            for col in schema.get("columns", []):
                name = col.get("name")
                col_type = col.get("type")
                sample_vals = col.get("sample_values", [])
                columns_prompt.append(f"- {name} ({col_type}): examples: {sample_vals}")
            
            columns_str = "\n".join(columns_prompt)

            system_prompt = (
                "You are an expert SQL analyst. Correct the failing SQL query.\n"
                "Generate SQLite-compatible SELECT queries only.\n"
                "Never use INSERT, UPDATE, DELETE, DROP, or any destructive operations.\n"
                "Always use the exact table name 'data'.\n"
                "Return ONLY the corrected SQL query, no explanation, no markdown, no backticks."
            )

            user_prompt = (
                f"Table schema:\n"
                f"Table name: data\n"
                f"Columns:\n"
                f"{columns_str}\n\n"
                f"This SQL query failed:\n"
                f"{original_sql}\n\n"
                f"Error details:\n"
                f"{error}\n\n"
                f"Fix the query and write a correct SQLite SELECT query."
            )

            print("[LLMService] Sending fix request to Groq...")
            completion = client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0
            )

            raw_response = completion.choices[0].message.content
            fixed_sql = self._clean_sql_response(raw_response)

            print(f"[LLMService] Fixed SQL:\n{fixed_sql}")
            return {
                "sql": fixed_sql
            }

        except Exception as e:
            print(f"[LLMService] Error fixing SQL: {e}")
            raise ValueError(f"Failed to fix SQL: {str(e)}")

    def generate_question_suggestions(self, schema: dict) -> list:
        """
        Generates 6 analytical questions that a business user might ask about the table dataset.
        """
        print("[LLMService] Generating question suggestions from schema...")
        try:
            client = self._get_client()

            # Format the columns section
            columns_prompt = []
            for col in schema.get("columns", []):
                name = col.get("name")
                col_type = col.get("type")
                sample_vals = col.get("sample_values", [])
                columns_prompt.append(f"- {name} ({col_type}): examples: {sample_vals}")
            
            columns_str = "\n".join(columns_prompt)

            system_prompt = (
                "You are an expert data analyst assistant. Generate interesting question suggestions for a database schema.\n"
                "Return ONLY a JSON array of strings, nothing else. No explanation, no markdown code block, no backticks."
            )

            user_prompt = (
                f"Given a table with these columns:\n"
                f"{columns_str}\n\n"
                f"generate 6 interesting analytical questions a business user might ask.\n"
                f"Return ONLY a JSON array of strings, nothing else."
            )

            completion = client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.5
            )

            raw_response = completion.choices[0].message.content.strip()
            print(f"[LLMService] Raw suggestions response: {raw_response}")

            # Strip markdown block wraps if present
            cleaned = raw_response
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                content_lines = [line for line in lines if not line.strip().startswith("```")]
                cleaned = "".join(content_lines).strip()
            cleaned = cleaned.strip("`").strip()

            import json
            suggestions = json.loads(cleaned)
            if isinstance(suggestions, list) and len(suggestions) >= 6:
                return suggestions[:6]
            else:
                raise ValueError("Response is not a valid list of 6 suggestions.")
        except Exception as e:
            print(f"[LLMService] Error generating suggestions: {e}. Falling back to default list.")
            # safe fallback suggestions
            return [
                "What is the total number of records?",
                "Show the first 10 rows of data.",
                "Summary statistics of numeric columns.",
                "How are the categories distributed?",
                "Which column values have the highest values?",
                "Filter and search records."
            ]

    def generate_sql_schema(self, question: str, schema_info: dict) -> dict:
        """
        Generates SQLite SELECT query using JOINs based on the user question and database relational schema.
        """
        print(f"[LLMService] Generating SQL (schema mode) for question: '{question}'")
        try:
            client = self._get_client()

            # Format database schema tables
            tables_prompt = []
            for tbl in schema_info.get("tables", []):
                tbl_name = tbl.get("name")
                tbl_rows = tbl.get("row_count", 0)
                
                columns_list = []
                for col in tbl.get("columns", []):
                    name = col.get("name")
                    col_type = col.get("type")
                    is_pk = col.get("is_primary_key", False)
                    is_fk = col.get("is_foreign_key", False)
                    ref_tbl = col.get("references_table")
                    ref_col = col.get("references_column")
                    
                    pk_str = " [PRIMARY KEY]" if is_pk else ""
                    fk_str = f" [FK → {ref_tbl}.{ref_col}]" if is_fk and ref_tbl and ref_col else ""
                    columns_list.append(f"  - {name} ({col_type}){pk_str}{fk_str}")
                    
                columns_str = "\n".join(columns_list)
                
                # Fetch sample rows and format as clean text
                sample_vals = []
                col_samples_len = max([len(c.get("sample_values", [])) for c in tbl.get("columns", [])]) if tbl.get("columns") else 0
                for r_idx in range(min(col_samples_len, 3)):
                    row_val = {}
                    for col in tbl.get("columns", []):
                        samples = col.get("sample_values", [])
                        if r_idx < len(samples):
                            row_val[col["name"]] = samples[r_idx]
                    sample_vals.append(row_val)
                
                tables_prompt.append(
                    f"Table: {tbl_name} ({tbl_rows} rows)\n"
                    f"Columns:\n"
                    f"{columns_str}\n"
                    f"Sample data (first 3 rows): {str(sample_vals)}"
                )
                
            tables_str = "\n\n".join(tables_prompt)

            # Format relationships
            rel_prompt = []
            for rel in schema_info.get("relationships", []):
                from_table = rel.get("from_table")
                from_column = rel.get("from_column")
                to_table = rel.get("to_table")
                to_column = rel.get("to_column")
                cardinality = rel.get("cardinality", "1:N")
                from_participation = rel.get("from_participation", "total")
                to_participation = rel.get("to_participation", "partial")
                rel_prompt.append(
                    f"  {from_table}.{from_column} → {to_table}.{to_column}\n"
                    f"   Type: {cardinality} | {from_table} participation: {from_participation} | {to_table} participation: {to_participation}"
                )
                
            relationships_str = "\n".join(rel_prompt)

            system_prompt = (
                "You are an expert SQL analyst working with a relational SQLite database.\n"
                "Generate SELECT queries only. Never use INSERT, UPDATE, DELETE, DROP, or ALTER.\n"
                "Use JOINs when the question requires data from multiple tables.\n"
                "Use meaningful table aliases: c for customers, o for orders, "
                "p for products, oi for order_items, r for reviews.\n"
                "Always alias aggregated columns with readable names.\n"
                "Limit results to 20 rows unless the question specifically asks for all.\n"
                "Return ONLY the raw SQL query — no explanation, no markdown, no backticks."
            )

            user_prompt = (
                f"Database schema:\n\n"
                f"{tables_str}\n\n"
                f"Relationships:\n"
                f"{relationships_str}\n\n"
                f"Question: {question}\n\n"
                f"Write a SQLite SELECT query using JOINs as needed."
            )

            print("[LLMService] Sending generation request to Groq...")
            completion = client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0
            )

            raw_response = completion.choices[0].message.content
            sql = self._clean_sql_response(raw_response)

            print(f"[LLMService] Generated Schema SQL:\n{sql}")
            return {
                "sql": sql,
                "raw_response": raw_response
            }

        except Exception as e:
            print(f"[LLMService] Error generating Schema SQL: {e}")
            raise ValueError(f"Failed to generate SQL for schema database: {str(e)}")

    def fix_sql_schema(self, original_sql: str, error: str, schema_info: dict) -> dict:
        """
        Takes a failing schema-mode SQL query, the execution error, and the schema info,
        and requests the LLM to correct the query.
        """
        print(f"[LLMService] Fixing SQL (schema mode): '{original_sql}' due to error: '{error}'")
        try:
            client = self._get_client()

            # Format database schema tables
            tables_prompt = []
            for tbl in schema_info.get("tables", []):
                tbl_name = tbl.get("name")
                tbl_rows = tbl.get("row_count", 0)
                
                columns_list = []
                for col in tbl.get("columns", []):
                    name = col.get("name")
                    col_type = col.get("type")
                    is_pk = col.get("is_primary_key", False)
                    is_fk = col.get("is_foreign_key", False)
                    ref_tbl = col.get("references_table")
                    ref_col = col.get("references_column")
                    
                    pk_str = " [PRIMARY KEY]" if is_pk else ""
                    fk_str = f" [FK → {ref_tbl}.{ref_col}]" if is_fk and ref_tbl and ref_col else ""
                    columns_list.append(f"  - {name} ({col_type}){pk_str}{fk_str}")
                    
                columns_str = "\n".join(columns_list)
                
                col_samples_len = max([len(c.get("sample_values", [])) for c in tbl.get("columns", [])]) if tbl.get("columns") else 0
                sample_vals = []
                for r_idx in range(min(col_samples_len, 3)):
                    row_val = {}
                    for col in tbl.get("columns", []):
                        samples = col.get("sample_values", [])
                        if r_idx < len(samples):
                            row_val[col["name"]] = samples[r_idx]
                    sample_vals.append(row_val)
                
                tables_prompt.append(
                    f"Table: {tbl_name} ({tbl_rows} rows)\n"
                    f"Columns:\n"
                    f"{columns_str}\n"
                    f"Sample data (first 3 rows): {str(sample_vals)}"
                )
                
            tables_str = "\n\n".join(tables_prompt)

            # Format relationships
            rel_prompt = []
            for rel in schema_info.get("relationships", []):
                from_table = rel.get("from_table")
                from_column = rel.get("from_column")
                to_table = rel.get("to_table")
                to_column = rel.get("to_column")
                cardinality = rel.get("cardinality", "1:N")
                from_participation = rel.get("from_participation", "total")
                to_participation = rel.get("to_participation", "partial")
                rel_prompt.append(
                    f"  {from_table}.{from_column} → {to_table}.{to_column}\n"
                    f"   Type: {cardinality} | {from_table} participation: {from_participation} | {to_table} participation: {to_participation}"
                )
                
            relationships_str = "\n".join(rel_prompt)

            system_prompt = (
                "You are an expert SQL analyst. Correct the failing SQLite SQL query.\n"
                "Generate SELECT queries only. Never use INSERT, UPDATE, DELETE, DROP, or ALTER.\n"
                "Return ONLY the corrected SQL query, no explanation, no markdown, no backticks."
            )

            user_prompt = (
                f"Database schema:\n\n"
                f"{tables_str}\n\n"
                f"Relationships:\n"
                f"{relationships_str}\n\n"
                f"This SQL query failed:\n"
                f"{original_sql}\n\n"
                f"Error details:\n"
                f"{error}\n\n"
                f"Fix the query and write a correct SQLite SELECT query."
            )

            print("[LLMService] Sending fix request to Groq...")
            completion = client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0
            )

            raw_response = completion.choices[0].message.content
            fixed_sql = self._clean_sql_response(raw_response)

            print(f"[LLMService] Fixed Schema SQL:\n{fixed_sql}")
            return {
                "sql": fixed_sql
            }

        except Exception as e:
            print(f"[LLMService] Error fixing Schema SQL: {e}")
            raise ValueError(f"Failed to fix SQL: {str(e)}")

# Singleton instance
llm_service = LLMService()

