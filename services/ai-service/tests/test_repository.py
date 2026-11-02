from pathlib import Path

from app.config import Settings
from app.contracts import IngestionSource, ProcessingStatus
from app.repository import Repository
from app.storage import LocalDocumentStore


def test_repository_persists_jobs_and_audit_events(tmp_path: Path) -> None:
    settings = Settings(storage_dir=tmp_path / "data", database_path=tmp_path / "db.sqlite3")
    store = LocalDocumentStore(settings)
    case_id, document = store.save_bytes(
        data=b"Amount Due: $300.00",
        original_filename="bill.txt",
        source=IngestionSource.upload,
        content_type="text/plain",
    )
    repository = Repository(settings)

    job = repository.create_job(case_id=case_id, documents=[document])
    repository.update_job(job_id=job.job_id, status=ProcessingStatus.running, attempts=1)
    repository.audit(
        event_type="job.running",
        message="Job started.",
        case_id=case_id,
        job_id=job.job_id,
    )

    loaded = repository.get_job(job.job_id)
    events = repository.list_audit_events(job_id=job.job_id)

    assert loaded is not None
    assert loaded.owner_user_id is None
    assert loaded.status == ProcessingStatus.running
    assert loaded.attempts == 1
    assert events[0].event_type == "job.running"
