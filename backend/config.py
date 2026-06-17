import os
from dotenv import load_dotenv

# Base directory is the root of the project (parent of 'backend')
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load .env file from base directory
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(env_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "llama-3.1-8b-instant"

DB_DIR = os.path.join(BASE_DIR, "databases", "csv")
SCHEMA_DB_DIR = os.path.join(BASE_DIR, "databases", "schema")
SAMPLE_DATA_DIR = os.path.join(BASE_DIR, "sample_data")

MAX_ROWS_RETURNED = 500
MAX_SQL_RETRIES = 3

# Auto-create directories if missing
os.makedirs(DB_DIR, exist_ok=True)
os.makedirs(SCHEMA_DB_DIR, exist_ok=True)
os.makedirs(SAMPLE_DATA_DIR, exist_ok=True)

print(f"[CONFIG] Base Directory: {BASE_DIR}")
print(f"[CONFIG] CSV Database Directory: {DB_DIR}")
print(f"[CONFIG] Schema Database Directory: {SCHEMA_DB_DIR}")
print(f"[CONFIG] Sample Data Directory: {SAMPLE_DATA_DIR}")
print(f"[CONFIG] Groq API Key loaded: {'Yes' if GROQ_API_KEY else 'No'}")

