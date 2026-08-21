from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.config import Settings
from app.contracts import (
    AuditEvent,
    ProcessedDocument,
    ProcessingJob,
    ProcessingStatus,
    StoredDocument,
)
from app.privacy import redact_phi


class Repository:
    def __init__(self, settings: Settings) -> None:
        self.path = settings.database_path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.init_schema()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def init_schema(self) -> None:
        with self.connect() as db:
            db.executescript(
                """
                PRAGMA journal_mode=WAL;

                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    case_id TEXT NOT NULL,
                    owner_user_id TEXT,
                    status TEXT NOT NULL,
                    document_ids_json TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS processed_documents (
                    job_id TEXT NOT NULL,
                    case_id TEXT NOT NULL,
                    document_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (job_id, document_id)
                );

                CREATE TABLE IF NOT EXISTS audit_events (
                    event_id TEXT PRIMARY KEY,
                    case_id TEXT,
                    document_id TEXT,
                    job_id TEXT,
                    event_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_jobs_case_id ON jobs(case_id);
                CREATE INDEX IF NOT EXISTS idx_audit_case_id ON audit_events(case_id);
                CREATE INDEX IF NOT EXISTS idx_audit_job_id ON audit_events(job_id);
                """
            )
            _ensure_column(db, "jobs", "owner_user_id", "TEXT")

    def create_job(
        self,
        *,
        case_id: UUID,
        documents: list[StoredDocument],
        owner_user_id: str | None = None,
    ) -> ProcessingJob:
        now = _now()
        resolved_owner = owner_user_id or next(
            (document.owner_user_id for document in documents if document.owner_user_id),
            None,
        )
        job = ProcessingJob(
            job_id=uuid4(),
            case_id=case_id,
            owner_user_id=resolved_owner,
            status=ProcessingStatus.queued,
            document_ids=[document.document_id for document in documents],
            created_at=now,
            updated_at=now,
        )
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO jobs (
                    job_id, case_id, owner_user_id, status, document_ids_json, attempts, error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(job.job_id),
                    str(job.case_id),
                    job.owner_user_id,
                    job.status,
                    json.dumps([str(document_id) for document_id in job.document_ids]),
                    job.attempts,
                    job.error,
                    job.created_at.isoformat(),
                    job.updated_at.isoformat(),
                ),
            )
        return job

    def get_job(self, job_id: UUID) -> ProcessingJob | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM jobs WHERE job_id = ?", (str(job_id),)).fetchone()
        return _job_from_row(row) if row else None

    def list_jobs(
        self,
        *,
        status: ProcessingStatus | None = None,
        limit: int = 100,
        owner_user_id: str | None = None,
    ) -> list[ProcessingJob]:
        query = "SELECT * FROM jobs"
        params: list[str | int] = []
        clauses: list[str] = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        if owner_user_id:
            clauses.append("owner_user_id = ?")
            params.append(owner_user_id)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at ASC LIMIT ?"
        params.append(limit)
        with self.connect() as db:
            rows = db.execute(query, params).fetchall()
        return [_job_from_row(row) for row in rows]

    def list_review_jobs(self, *, limit: int = 100, owner_user_id: str | None = None) -> list[ProcessingJob]:
        query = """
            SELECT * FROM jobs
            WHERE status IN (?, ?)
        """
        params: list[str | int] = [ProcessingStatus.needs_review, ProcessingStatus.failed]
        if owner_user_id:
            query += " AND owner_user_id = ?"
            params.append(owner_user_id)
        query += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        with self.connect() as db:
            rows = db.execute(query, params).fetchall()
        return [_job_from_row(row) for row in rows]

    def update_job(
        self,
        *,
        job_id: UUID,
        status: ProcessingStatus,
        attempts: int | None = None,
        error: str | None = None,
    ) -> None:
        with self.connect() as db:
            current = db.execute("SELECT attempts FROM jobs WHERE job_id = ?", (str(job_id),)).fetchone()
            resolved_attempts = attempts if attempts is not None else (current["attempts"] if current else 0)
            db.execute(
                """
                UPDATE jobs
                SET status = ?, attempts = ?, error = ?, updated_at = ?
                WHERE job_id = ?
                """,
                (status, resolved_attempts, error, _now().isoformat(), str(job_id)),
            )

    def save_processed_document(
        self,
        *,
        job_id: UUID,
        case_id: UUID,
        processed_document: ProcessedDocument,
    ) -> None:
        with self.connect() as db:
            db.execute(
                """
                INSERT OR REPLACE INTO processed_documents (
                    job_id, case_id, document_id, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    str(job_id),
                    str(case_id),
                    str(processed_document.document.document_id),
                    processed_document.model_dump_json(),
                    _now().isoformat(),
                ),
            )

    def list_processed_documents(self, job_id: UUID) -> list[ProcessedDocument]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT payload_json FROM processed_documents WHERE job_id = ? ORDER BY created_at",
                (str(job_id),),
            ).fetchall()
        return [ProcessedDocument.model_validate_json(row["payload_json"]) for row in rows]

    def list_processed_documents_for_case(
        self,
        case_id: UUID,
        owner_user_id: str | None = None,
    ) -> list[ProcessedDocument]:
        query = """
            SELECT pd.payload_json
            FROM processed_documents pd
            JOIN (
                SELECT document_id, MAX(created_at) AS created_at
                FROM processed_documents
                WHERE case_id = ?
                GROUP BY document_id
            ) latest
            ON pd.document_id = latest.document_id
            AND pd.created_at = latest.created_at
            WHERE pd.case_id = ?
        """
        params: list[str] = [str(case_id), str(case_id)]
        if owner_user_id:
            query += ' AND json_extract(pd.payload_json, "$.document.owner_user_id") = ?'
            params.append(owner_user_id)
        query += " ORDER BY pd.created_at"
        with self.connect() as db:
            rows = db.execute(query, params).fetchall()
        return [ProcessedDocument.model_validate_json(row["payload_json"]) for row in rows]

    def audit(
        self,
        *,
        event_type: str,
        message: str,
        case_id: UUID | None = None,
        document_id: UUID | None = None,
        job_id: UUID | None = None,
        metadata: dict | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            event_id=uuid4(),
            case_id=case_id,
            document_id=document_id,
            job_id=job_id,
            event_type=event_type,
            message=redact_phi(message),
            metadata=redact_phi(metadata or {}),
            created_at=_now(),
        )
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO audit_events (
                    event_id, case_id, document_id, job_id, event_type, message, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(event.event_id),
                    str(event.case_id) if event.case_id else None,
                    str(event.document_id) if event.document_id else None,
                    str(event.job_id) if event.job_id else None,
                    event.event_type,
                    event.message,
                    json.dumps(event.metadata),
                    event.created_at.isoformat(),
                ),
            )
        return event

    def list_audit_events(
        self,
        *,
        case_id: UUID | None = None,
        job_id: UUID | None = None,
        limit: int = 100,
    ) -> list[AuditEvent]:
        query = "SELECT * FROM audit_events"
        params: list[str | int] = []
        clauses = []
        if case_id:
            clauses.append("case_id = ?")
            params.append(str(case_id))
        if job_id:
            clauses.append("job_id = ?")
            params.append(str(job_id))
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self.connect() as db:
            rows = db.execute(query, params).fetchall()
        return [_audit_from_row(row) for row in rows]


def _now() -> datetime:
    return datetime.now(UTC)


def _job_from_row(row: sqlite3.Row) -> ProcessingJob:
    return ProcessingJob(
        job_id=UUID(row["job_id"]),
        case_id=UUID(row["case_id"]),
        owner_user_id=row["owner_user_id"],
        status=ProcessingStatus(row["status"]),
        document_ids=[UUID(value) for value in json.loads(row["document_ids_json"])],
        attempts=row["attempts"],
        error=row["error"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _audit_from_row(row: sqlite3.Row) -> AuditEvent:
    return AuditEvent(
        event_id=UUID(row["event_id"]),
        case_id=UUID(row["case_id"]) if row["case_id"] else None,
        document_id=UUID(row["document_id"]) if row["document_id"] else None,
        job_id=UUID(row["job_id"]) if row["job_id"] else None,
        event_type=row["event_type"],
        message=row["message"],
        metadata=json.loads(row["metadata_json"]),
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def _ensure_column(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
    column_sql: str,
) -> None:
    columns = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name not in columns:
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")
