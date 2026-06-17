# Natural Language Data Analyst

## Overview
A powerful full-stack analytical web application that enables users to query structured databases using plain, conversational English. The system automatically converts natural language questions into highly optimized, dialect-specific SQL, executes it against an embedded SQLite database, renders beautiful responsive charts (pure SVG without third-party chart libraries), and synthesizes qualitative business insights from the results using generative AI.

## Features
- 🗣️ **Natural language to SQL conversion**: Translates conversational questions into accurate SQLite SELECT queries.
- 📊 **Auto-generated charts**: Renders pure-SVG Bar, Line, and Pie charts dynamically based on query results column metadata (completely zero-dependency).
- 💡 **AI-generated insights**: Summarizes query execution results into concise business insights in real time.
- 📁 **Upload your own CSV datasets**: Seamlessly upload custom CSV files which are automatically formatted, sanitized, and loaded into individual SQLite database files.
- 🗃️ **Built-in sample datasets**: Pre-loaded with Sales, Employees, and E-commerce sample data to start querying immediately.
- 🔄 **Auto-retry on SQL errors**: Automatically catches execution syntax/type failures and prompts the LLM to fix the query (up to 3 retries).
- 📥 **Export results as CSV**: Downloads query data instantly as CSV files named based on the source question.
- 💡 **Query Suggestions**: Generates and caches 6 interesting question suggestions using AI when a dataset is opened.
- 🕒 **Recent Queries Log**: Retains the last 20 queries run during a session for rapid re-execution.
- ⌨️ **Keyboard Shortcuts**: Focuses input with `Ctrl+K`, submits with `Ctrl+Enter`, and pulls the last query using the `Arrow Up` key when empty.

## Tech Stack

| Technology | Purpose |
|---|---|
| **Python 3.10+ / FastAPI** | Backend web server and REST API routing |
| **Groq (Llama 3.1 8B)** | Advanced SQL query generation, self-correction, suggestions, and text insights |
| **SQLite + Pandas** | SQL database storage, schema analysis, and query execution |
| **React + Vite** | High-performance, reactive single-page frontend application |
| **Pure CSS / HTML5** | Modern, premium glassmorphism dark-mode styling and UI aesthetics |
| **Pure SVG** | High-fidelity interactive charts and visual graphs (zero-dependency) |

---

## Project Structure

```text
nl-data-analyst/
├── backend/
│   ├── main.py                 # FastAPI routing, CORS middleware, and cache setup
│   ├── config.py               # Global server constants, LLM model selection, and API keys
│   ├── schemas.py              # Pydantic models validating REST request and response contracts
│   ├── requirements.txt        # Python dependency manifest (FastAPI, Groq, Pandas)
│   └── services/               # Core business logic handlers
│       ├── csv_service.py      # CSV loading, parsing, and SQLite DB generation
│       ├── sql_service.py      # SQLite execution, query sanitization, and safety audits
│       ├── llm_service.py      # SQL generation, self-repair pipelines, and suggestions
│       └── insight_service.py  # Text synthesis translating tabular data to business insights
├── databases/                  # Storage directory containing generated SQLite .db files
├── sample_data/                # Built-in sample CSV datasets (Sales, Employees, E-commerce)
├── frontend/
│   ├── src/
│   │   ├── components/         # Reusable React UI component layers
│   │   │   ├── Sidebar.jsx     # Side menu listing datasets, upload buttons, and recent logs
│   │   │   ├── UploadView.jsx  # Drag-and-drop CSV upload landing zone
│   │   │   ├── DataPreview.jsx # Overview statistics, column schema, and data grid preview
│   │   │   ├── QueryView.jsx   # Context bars, query log panels, and suggestions decks
│   │   │   ├── QueryInput.jsx  # Query textarea form with key shortcut binds
│   │   │   ├── QueryResult.jsx # Collapsible SQL, data table, and chart selector display
│   │   │   ├── ChartView.jsx   # SVG chart routing, scaling, grid plotting, and tooltips
│   │   │   ├── DataTable.jsx   # Interactive data matrix grid
│   │   │   └── LoadingResult.jsx # Dynamic shimmers skeleton loading placeholders
│   │   ├── api.js              # JavaScript fetch integration layer mapping REST endpoints
│   │   ├── App.jsx             # Top-level state coordinator, stats bar, and toast managers
│   │   ├── index.css           # Global custom CSS styles, animations, and responsive queries
│   │   └── main.jsx            # React client DOM mounter
│   ├── package.json            # Node.js dev server and build tool dependencies
│   ├── vite.config.js          # Vite custom proxy and build settings
│   └── index.html              # Main HTML skeleton file
├── .env                        # Environment credentials (API keys, ports)
└── README.md                   # Project documentation manual
```

---

## Getting Started

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **Groq API Key** (obtain free from [console.groq.com](https://console.groq.com))

### Installation & Running

#### 1. Setup the Backend
Navigate to the root directory and create a virtual environment:
```bash
# Create python virtual environment
python -m venv .venv

# Activate the virtual environment
# On Windows (Command Prompt/PowerShell):
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
```

Create a `.env` configuration file in the project root (using `.env.template` as a model) and fill in your Groq API Key:
```env
GROQ_API_KEY=gsk_your_actual_groq_api_key_here
PORT=8000
```

Start the backend FastAPI server:
```bash
# Run the backend using Uvicorn
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
The API documentation will be available at `http://127.0.0.1:8000/docs`.

#### 2. Setup the Frontend
Open a new terminal session, navigate to the `frontend/` directory, install packages, and start the development server:
```bash
cd frontend

# Install client packages
npm install

# Start Vite dev environment
npm run dev -- --port 5173 --host 127.0.0.1
```
The web application is now active at `http://127.0.0.1:5173/`.

---

## How It Works

1. **Dataset Selection & Conversion**: The user selects a preloaded dataset or drops in a custom CSV file. The backend parses it using Pandas and maps datatypes to create an optimized SQLite database file inside the `databases/` folder.
2. **Dynamic Question Suggestions**: When a dataset is loaded, its schema is analysed and passed to the Llama model on Groq to compile 6 business-relevant query suggestions. Suggestions are cached in-memory.
3. **Natural Language Translation**: The user submits a conversational question. The LLM translates the query based on the table schema and SQL formatting system prompts.
4. **Execution & Self-Correction**: The SQLite query is verified against destructive SQL keywords (only SELECTs allowed) and executed. If SQLite throws a syntax error, the LLM-service receives the failing SQL and stacktrace to attempt self-correction.
5. **Visualization Layout**: The frontend parses the output matrix. If column headers contain labels + numbers, it charts the data:
   - **Pie Chart**: Used for $\le 6$ distinct labels (great for composition summaries).
   - **Bar Chart**: Generates dynamic scale sizes and plots vertical bars with custom hover tooltips.
   - **Line Chart**: Draws line series, highlights points, and adds linear gradients under the curves.
6. **Insight Synthesis**: Groq translates the final matrix rows and original question to output a concise 2-3 sentence business summary.

---

## Future Improvements
- **PostgreSQL / MySQL Connectors**: Run natural language analytics on enterprise production databases.
- **Multi-Table JOIN Support**: Incorporate relational schema graphs to query complex multi-table relationships.
- **Dashboard View**: Pin multiple query results cards and auto-refresh reports.
- **Interactive Visualizations**: Modify chart styles, axes, and colors using conversational commands.
- **PDF Exporter**: Export the full history log along with SVG charts and text insights into a PDF report document.

## License
MIT
