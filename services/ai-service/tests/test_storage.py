from pathlib import Path

from cryptography.fernet import Fernet

from app.config import Settings
from app.contracts import IngestionSource, MalwareScanStatus
from app.storage import LocalDocumentStore


def test_store_indexes_documents_by_case_and_document_id(tmp_path: Path) -> None:
    store = LocalDocumentStore(Settings(storage_dir=tmp_path))

    case_id, document = store.save_bytes(
        data=b"test bill",
        original_filename="bill.pdf",
        source=IngestionSource.upload,
        content_type="application/pdf",
        owner_user_id="patient-1",
    )

    loaded = store.get_document(case_id=case_id, document_id=document.document_id)

    assert loaded is not None
    assert loaded.document_id == document.document_id
    assert loaded.owner_user_id == "patient-1"
    assert Path(loaded.storage_path).exists()


def test_store_can_encrypt_and_decrypt_documents(tmp_path: Path) -> None:
    settings = Settings(storage_dir=tmp_path, storage_encryption_key=Fernet.generate_key().decode())
    store = LocalDocumentStore(settings)

    _, document = store.save_bytes(
        data=b"secret bill",
        original_filename="bill.txt",
        source=IngestionSource.upload,
        content_type="text/plain",
    )

    assert document.encrypted is True
    assert Path(document.storage_path).read_bytes() != b"secret bill"
    assert store.read_document(document) == b"secret bill"


def test_store_records_clean_malware_scan_status(tmp_path: Path) -> None:
    store = LocalDocumentStore(Settings(storage_dir=tmp_path))

    _, document = store.save_bytes(
        data=b"Amount Due: $300.00",
        original_filename="bill.txt",
        source=IngestionSource.upload,
        content_type="text/plain",
    )

    assert document.malware_scan_status == MalwareScanStatus.clean


def test_store_rejects_suspicious_uploads(tmp_path: Path) -> None:
    store = LocalDocumentStore(Settings(storage_dir=tmp_path))

    try:
        store.save_bytes(
            data=b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
            original_filename="bill.txt",
            source=IngestionSource.upload,
            content_type="text/plain",
        )
    except ValueError as exc:
        assert "rejected" in str(exc).lower()
    else:
        raise AssertionError("Suspicious upload should have been rejected.")
