from pathlib import Path

from app.config import Settings
from app.contracts import IngestionSource, ProcessingStatus
from app.processing import ProcessingService
from app.repository import Repository
from app.storage import LocalDocumentStore


def test_worker_processes_queued_jobs(tmp_path: Path) -> None:
    settings = Settings(
        storage_dir=tmp_path / "data",
        cache_dir=tmp_path / "cache",
        database_path=tmp_path / "db.sqlite3",
        ocr_engine="tesseract",
    )
    store = LocalDocumentStore(settings)
    case_id, document = store.save_bytes(
        data=b"North Valley Hospital\nAccount Number: ABC12345\nAmount Due: $300.00",
        original_filename="bill.txt",
        source=IngestionSource.upload,
        content_type="text/plain",
    )
    repository = Repository(settings)
    job = repository.create_job(case_id=case_id, documents=[document])

    processed_count = ProcessingService(settings).process_queued_jobs(use_ai=False)
    updated = repository.get_job(job.job_id)
    processed_documents = repository.list_processed_documents(job.job_id)

    assert processed_count == 1
    assert updated.status == ProcessingStatus.succeeded
    assert processed_documents[0].extraction.account_number == "ABC12345"
