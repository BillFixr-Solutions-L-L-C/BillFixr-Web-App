from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


def _override_settings(tmp_path, **overrides):
    settings = Settings(
        storage_dir=tmp_path / "data",
        cache_dir=tmp_path / "cache",
        database_path=tmp_path / "billfixr.sqlite3",
        log_file=tmp_path / "billfixr.log",
        **overrides,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    return settings


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_demo_frontend_serves() -> None:
    client = TestClient(app)

    response = client.get("/")

    assert response.status_code == 200
    assert "BillFixr Ingestion Console" in response.text
    assert "Unsupported document" in response.text


def test_health_reports_ocr_engine() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["ocr_engine"] == "tesseract"


def test_ingest_and_process_documents_endpoint() -> None:
    client = TestClient(app)

    response = client.post(
        "/v1/ingestion/documents/process",
        files={"files": ("statement.txt", b"Account Number: ABC12345\nAmount Due: $300.00", "text/plain")},
        data={"use_ai": "false"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["processed_documents"][0]["extraction"]["account_number"] == "ABC12345"
    assert body["processed_documents"][0]["extraction"]["patient_responsibility"]["amount"] == 300.0
    assert body["processed_documents"][0]["validation"]["quality_score"] >= 0.7


def test_wrong_document_upload_returns_graceful_unsupported_state() -> None:
    client = TestClient(app)

    response = client.post(
        "/v1/ingestion/documents/process",
        files={
            "files": (
                "resume.txt",
                b"St. Mark Adebayo\nAI Engineer\nFastAPI, RAG, OCR, LangChain\nExperience\nProjects",
                "text/plain",
            )
        },
        data={"use_ai": "false"},
    )

    assert response.status_code == 200
    processed = response.json()["processed_documents"][0]
    assert processed["extraction"]["document_type"] == "unknown"
    assert processed["validation"]["needs_review"] is True
    assert processed["validation"]["quality_score"] < 0.75
    assert "does not look like a supported medical billing document" in processed["validation"]["findings"][0]["message"]


def test_async_processing_endpoint_returns_job_status() -> None:
    client = TestClient(app)

    response = client.post(
        "/v1/ingestion/documents/process-async",
        files={"files": ("statement.txt", b"Account Number: ABC12345\nAmount Due: $300.00", "text/plain")},
        data={"use_ai": "false"},
    )

    assert response.status_code == 200
    body = response.json()
    job_response = client.get(f"/v1/jobs/{body['job_id']}")

    assert job_response.status_code == 200
    assert job_response.json()["job"]["status"] in {"queued", "running", "succeeded", "needs_review"}


def test_case_processing_returns_analysis_and_draft() -> None:
    client = TestClient(app)

    response = client.post(
        "/v1/cases/process",
        files={
            "files": (
                "statement.txt",
                b"North Valley Hospital\nPatient: Jordan Taylor\nAccount Number: ABC12345\nAmount Due: $300.00",
                "text/plain",
            )
        },
        data={"use_ai": "false"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["analysis"]["recommended_action"]["action_type"] == "request_payment_plan"
    assert body["draft"]["recipient_type"] == "hospital_billing"
    assert body["job"]["status"] == "succeeded"


def test_case_analysis_and_draft_endpoints_use_processed_case_records() -> None:
    client = TestClient(app)

    process_response = client.post(
        "/v1/cases/process",
        files={
            "files": (
                "statement.txt",
                b"North Valley Hospital\nAccount Number: ABC12345\nAmount Due: $300.00",
                "text/plain",
            )
        },
        data={"use_ai": "false"},
    )
    assert process_response.status_code == 200
    case_id = process_response.json()["case_id"]

    analysis_response = client.get(f"/v1/cases/{case_id}/analysis")
    assert analysis_response.status_code == 200
    assert analysis_response.json()["analysis"]["document_count"] == 1

    draft_response = client.post(
        f"/v1/cases/{case_id}/drafts",
        json={"case_id": case_id, "action_type": "request_itemized_bill", "user_notes": "Need coding detail."},
    )
    assert draft_response.status_code == 200
    assert "itemized" in draft_response.json()["draft"]["subject"].lower()


def test_local_api_key_auth_blocks_missing_key(tmp_path) -> None:
    _override_settings(tmp_path, local_api_key="dev-secret")
    client = TestClient(app)

    try:
        response = client.post(
            "/v1/ingestion/documents/process",
            files={"files": ("statement.txt", b"Amount Due: $300.00", "text/plain")},
            data={"use_ai": "false"},
        )
    finally:
        _clear_overrides()

    assert response.status_code == 401


def test_local_role_auth_blocks_disallowed_role(tmp_path) -> None:
    _override_settings(tmp_path, local_api_key="dev-secret")
    client = TestClient(app)

    try:
        response = client.get(
            "/v1/audit/events",
            headers={"X-API-Key": "dev-secret", "X-User-Role": "patient"},
        )
    finally:
        _clear_overrides()

    assert response.status_code == 403


def test_review_queue_and_approval_flow(tmp_path) -> None:
    _override_settings(tmp_path, local_api_key="dev-secret")
    client = TestClient(app)
    headers = {"X-API-Key": "dev-secret", "X-User-Role": "admin", "X-User-ID": "reviewer-1"}

    try:
        response = client.post(
            "/v1/ingestion/documents/process-async",
            headers=headers,
            files={
                "files": (
                    "statement.txt",
                    b"Account Number: ABC12345",
                    "text/plain",
                )
            },
            data={"use_ai": "false"},
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]
        run_response = client.post(f"/v1/jobs/{job_id}/run?use_ai=false", headers=headers)
        assert run_response.status_code == 200
        assert run_response.json()["job"]["status"] == "needs_review"

        queue_response = client.get("/v1/review/queue", headers=headers)
        assert queue_response.status_code == 200
        assert any(item["job"]["job_id"] == job_id for item in queue_response.json())

        approve_response = client.post(f"/v1/review/jobs/{job_id}/approve", headers=headers)
        assert approve_response.status_code == 200
        assert approve_response.json()["job"]["status"] == "approved"
    finally:
        _clear_overrides()


def test_extract_from_encrypted_stored_document(tmp_path) -> None:
    _override_settings(tmp_path, storage_encryption_key=Fernet.generate_key().decode())
    client = TestClient(app)

    try:
        ingest_response = client.post(
            "/v1/ingestion/documents",
            files={"files": ("statement.txt", b"Account Number: ABC12345\nAmount Due: $300.00", "text/plain")},
        )
        assert ingest_response.status_code == 200
        body = ingest_response.json()
        case_id = body["case_id"]
        document_id = body["documents"][0]["document_id"]
        assert body["documents"][0]["encrypted"] is True

        extraction_response = client.post(
            "/v1/extraction/bills",
            json={"case_id": case_id, "document_id": document_id, "use_ai": False},
        )
        assert extraction_response.status_code == 200
        assert extraction_response.json()["extraction"]["account_number"] == "ABC12345"
    finally:
        _clear_overrides()


def test_patient_cannot_access_another_patients_job_or_case(tmp_path) -> None:
    _override_settings(tmp_path, local_api_key="dev-secret")
    client = TestClient(app)
    patient_one = {"X-API-Key": "dev-secret", "X-User-Role": "patient", "X-User-ID": "patient-1"}
    patient_two = {"X-API-Key": "dev-secret", "X-User-Role": "patient", "X-User-ID": "patient-2"}

    try:
        process_response = client.post(
            "/v1/cases/process",
            headers=patient_one,
            files={
                "files": (
                    "statement.txt",
                    b"North Valley Hospital\nAccount Number: ABC12345\nAmount Due: $300.00",
                    "text/plain",
                )
            },
            data={"use_ai": "false"},
        )
        assert process_response.status_code == 200
        payload = process_response.json()

        job_response = client.get(f"/v1/jobs/{payload['job']['job_id']}", headers=patient_two)
        assert job_response.status_code == 403

        analysis_response = client.get(f"/v1/cases/{payload['case_id']}/analysis", headers=patient_two)
        assert analysis_response.status_code == 404
    finally:
        _clear_overrides()
