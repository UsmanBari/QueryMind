import os
import json
from groq import Groq
from typing import Dict, Any
from backend import config

class InsightService:
    def __init__(self):
        print("[InsightService] Initializing InsightService singleton...")
        self.client = None

    def _get_client(self) -> Groq:
        if self.client is None:
            if not config.GROQ_API_KEY:
                raise ValueError("Groq API Key is not set in the environment or configuration.")
            self.client = Groq(api_key=config.GROQ_API_KEY)
        return self.client

    def generate_insight(self, question: str, sql: str, results: dict) -> str:
        """
        Generates a 2-3 sentence human insight from the user's question,
        the SQL query executed, and the query results (limiting to first 10 rows).
        """
        print(f"[InsightService] Generating insight for question: '{question}'")
        try:
            client = self._get_client()

            # 1. Format first 10 rows of results for the prompt
            columns = results.get("columns", [])
            raw_rows = results.get("rows", [])
            first_10_rows = raw_rows[:10]
            
            # Map columns to values for a friendly JSON representation
            formatted_rows = []
            for row in first_10_rows:
                formatted_rows.append(dict(zip(columns, row)))
            
            results_json_str = json.dumps(formatted_rows, indent=2, default=str)

            system_prompt = (
                "You are an expert data analyst who explains database results in clear, natural language.\n"
                "Your insights must be factual, directly answering the user's question based ONLY on the provided database results.\n"
                "Provide a concise summary (2-3 sentences) pointing out specific numbers, trends, or comparisons from the results.\n"
                "Do not start with 'Based on the data' or 'The data shows' - just state the findings directly.\n"
                "Do not include any greeting, markdown formatting (other than numbers/currency), or meta-explanation."
            )

            user_prompt = (
                f"Given this question: '{question}'\n"
                f"And this SQL query: '{sql}'\n"
                f"And these results (first 10 rows):\n"
                f"{results_json_str}\n\n"
                f"Write 2-3 sentences of insight about what the data shows. "
                f"Be specific — mention actual numbers, trends, or comparisons from the results. "
                f"Do not say 'the data shows' — just state the findings directly."
            )

            print("[InsightService] Sending insight request to Groq...")
            completion = client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3  # slightly higher temperature for smooth natural language generation
            )

            insight = completion.choices[0].message.content.strip()
            print(f"[InsightService] Generated insight: {insight}")
            return insight

        except Exception as e:
            print(f"[InsightService] Error generating insight: {e}")
            raise ValueError(f"Failed to generate insight: {str(e)}")

# Singleton instance
insight_service = InsightService()
