import json
import re
from hashlib import sha256
from pathlib import Path
from uuid import UUID, uuid4

from app.config import Settings
from app.contracts import IngestionSource, MalwareScanStatus, StoredDocument
from app.scanner import scan_upload


class LocalDocumentStore:
    def __init__(self, settings: Settings) -> None:
        self.root = settings.storage_dir
        self.max_upload_bytes = settings.max_upload_bytes
        self.allowed_extensions = {
            extension.strip().lower()
            for extension in settings.allowed_upload_extensions.split(",")
            if extension.strip()
        }
        self.encryption_key = settings.storage_encryption_key
        self.settings = settings

    def save_bytes(
        self,
        *,
        data: bytes,
        original_filename: str,
        source: IngestionSource,
        content_type: str | None,
        case_id: UUID | None = None,
        owner_user_id: str | None = None,
    ) -> tuple[UUID, StoredDocument]:
        self._validate_upload(data=data, original_filename=original_filename)
        scan_result = scan_upload(data=data, filename=original_filename, settings=self.settings)
        if scan_result.status == MalwareScanStatus.rejected:
            raise ValueError(scan_result.message)
        case_id = case_id or uuid4()
        document_id = uuid4()
        digest = sha256(data).hexdigest()
        safe_name = _safe_filename(original_filename)
        case_dir = self.root / str(case_id)
        case_dir.mkdir(parents=True, exist_ok=True)
        path = case_dir / f"{document_id}-{digest[:12]}-{safe_name}"
        payload = self._encrypt(data) if self.encryption_key else data
        if self.encryption_key:
            path = path.with_suffix(path.suffix + ".enc")
        path.write_bytes(payload)

        document = StoredDocument(
            document_id=document_id,
            source=source,
            original_filename=original_filename,
            content_type=content_type,
            owner_user_id=owner_user_id,
            storage_path=str(path),
            sha256=digest,
            byte_size=len(data),
            encrypted=bool(self.encryption_key),
            malware_scan_status=scan_result.status,
        )
        self._append_index(case_id, document)
        return case_id, document

    def read_document(self, document: StoredDocument) -> bytes:
        data = Path(document.storage_path).read_bytes()
        if document.encrypted:
            return self._decrypt(data)
        return data

    def get_document(self, *, case_id: UUID, document_id: UUID) -> StoredDocument | None:
        index_path = self.root / str(case_id) / "documents.json"
        if not index_path.exists():
            return None
        records = json.loads(index_path.read_text())
        for record in records:
            if record.get("document_id") == str(document_id):
                return StoredDocument.model_validate(record)
        return None

    def _append_index(self, case_id: UUID, document: StoredDocument) -> None:
        index_path = self.root / str(case_id) / "documents.json"
        records = []
        if index_path.exists():
            records = json.loads(index_path.read_text())
        records.append(document.model_dump(mode="json"))
        index_path.write_text(json.dumps(records, indent=2))

    def _validate_upload(self, *, data: bytes, original_filename: str) -> None:
        if len(data) > self.max_upload_bytes:
            raise ValueError(
                f"Upload is {len(data)} bytes, which exceeds limit of {self.max_upload_bytes} bytes."
            )
        suffix = Path(original_filename).suffix.lower()
        if suffix not in self.allowed_extensions:
            raise ValueError(f"File extension '{suffix or '(none)'}' is not allowed.")

    def _encrypt(self, data: bytes) -> bytes:
        from cryptography.fernet import Fernet

        return Fernet(self.encryption_key.encode()).encrypt(data)

    def _decrypt(self, data: bytes) -> bytes:
        from cryptography.fernet import Fernet

        return Fernet(self.encryption_key.encode()).decrypt(data)


def _safe_filename(filename: str) -> str:
    basename = Path(filename).name
    return re.sub(r"[^A-Za-z0-9._-]+", "_", basename)[:180] or "upload.bin"
