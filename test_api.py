import os
import sys
import io
import time
from fastapi.testclient import TestClient

# Ensure parent directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from backend.main import app
from backend import config

client = TestClient(app)

def test_health():
    print("\n--- Test Health Endpoint ---")
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["groq_configured"] is True
    assert "sales" in data["sample_datasets"]
    print("[OK] Health endpoint returned healthy state.")

def test_get_datasets():
    print("\n--- Test Get Datasets ---")
    response = client.get("/datasets")
    assert response.status_code == 200
    data = response.json()
    assert "datasets" in data
    assert data["total"] >= 3
    
    # Verify sample datasets exist
    sample_names = {ds["db_name"] for ds in data["datasets"] if ds["is_sample"]}
    assert "sales" in sample_names
    assert "employees" in sample_names
    assert "ecommerce" in sample_names
    print(f"[OK] Retrieved {data['total']} datasets successfully.")

def test_get_schema():
    print("\n--- Test Get Schema ---")
    # Valid dataset
    response = client.get("/datasets/employees/schema")
    assert response.status_code == 200
    data = response.json()
    assert data["db_name"] == "employees"
    assert data["table_name"] == "data"
    assert len(data["columns"]) > 0
    assert data["row_count"] == 25
    print("[OK] Schema for employees retrieved successfully.")

    # Invalid dataset (404)
    response = client.get("/datasets/nonexistent_db/schema")
    assert response.status_code == 404
    print("[OK] Non-existent schema query correctly returned 404.")

    # Path traversal validation (400)
    response = client.get("/datasets/invalid-name-with-dash/schema")
    assert response.status_code == 400
    print("[OK] Invalid db_name with dash correctly returned 400.")

def test_upload_and_delete_flow():
    print("\n--- Test CSV Upload, Preview, and Delete Flow ---")
    # 1. Create a dummy CSV file
    csv_content = (
        "id,name,role,level\n"
        "1,Alice,Engineer,L1\n"
        "2,Bob,Product Manager,L2\n"
        "3,Charlie,Designer,L1\n"
    )
    file_payload = {"file": ("test_upload_dataset.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}

    # 2. Upload the CSV file
    response = client.post("/upload", files=file_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["db_name"] == "test_upload_dataset"
    assert data["row_count"] == 3
    assert "name" in data["columns"]
    print("[OK] Uploaded CSV dataset successfully.")

    # 3. Upload duplicate CSV file (expected 409)
    file_payload_dup = {"file": ("test_upload_dataset.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response_dup = client.post("/upload", files=file_payload_dup)
    assert response_dup.status_code == 409
    assert "already uploaded" in response_dup.json()["detail"]
    print("[OK] Duplicate upload correctly rejected with 409 Conflict.")

    # 4. Preview the uploaded dataset
    response_preview = client.get("/datasets/test_upload_dataset/preview")
    assert response_preview.status_code == 200
    preview_data = response_preview.json()
    assert preview_data["row_count"] == 3
    assert len(preview_data["rows"]) == 3
    assert preview_data["columns"] == ["id", "name", "role", "level"]
    print("[OK] Previewed uploaded dataset successfully.")

    # 5. Delete the uploaded dataset
    response_delete = client.delete("/datasets/test_upload_dataset")
    assert response_delete.status_code == 200
    assert response_delete.json()["success"] is True
    print("[OK] Deleted uploaded dataset successfully.")

    # 6. Try deleting a sample dataset (expected 403)
    response_del_sample = client.delete("/datasets/employees")
    assert response_del_sample.status_code == 403
    print("[OK] Deleting sample dataset correctly rejected with 403 Forbidden.")

def test_query_pipeline():
    print("\n--- Test Query Pipeline ---")
    # Standard query
    payload = {
        "question": "What is the average revenue for products in the Clothing category?",
        "db_name": "sales"
    }
    response = client.post("/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["question"] == payload["question"]
    assert data["db_name"] == "sales"
    assert "results" in data
    assert len(data["results"]["columns"]) > 0
    assert "insight" in data
    assert "X-Process-Time" in response.headers
    print(f"[OK] Standard query returned successfully in {response.headers['X-Process-Time']}.")
    print(f"  SQL: {data['sql']}")
    print(f"  Insight: {data['insight']}")

    # Validation: min length constraint on question (expected 422)
    payload_short = {
        "question": "a",
        "db_name": "sales"
    }
    response_short = client.post("/query", json=payload_short)
    assert response_short.status_code == 422
    print("[OK] Question less than 3 characters correctly rejected with 422.")

    # Validation: max length constraint on question (expected 422)
    payload_long = {
        "question": "a" * 301,
        "db_name": "sales"
    }
    response_long = client.post("/query", json=payload_long)
    assert response_long.status_code == 422
    print("[OK] Question greater than 300 characters correctly rejected with 422.")

    # Validation: db_name pattern constraint (expected 422)
    payload_bad_db = {
        "question": "What is the average revenue?",
        "db_name": "sales-invalid-dash"
    }
    response_bad_db = client.post("/query", json=payload_bad_db)
    assert response_bad_db.status_code == 422
    print("[OK] Database name with invalid format correctly rejected with 422.")

if __name__ == "__main__":
    print("Starting integration tests for API routes...")
    test_health()
    test_get_datasets()
    test_get_schema()
    test_upload_and_delete_flow()
    test_query_pipeline()
    print("\nAll API integration tests passed successfully!")
