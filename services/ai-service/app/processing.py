from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from uuid import UUID

from app.ai.provider import ExtractionProvider
from app.casework import analyze_case, draft_communication
from app.config import Settings
from app.contracts import (
    CaseAnalysis,
    DraftCommunication,
    ProcessedDocument,
    ProcessingJob,
    ProcessingStatus,
    StoredDocument,
)
from app.ingestion.pipeline import ExtractionPipeline
from app.repository import Repository
from app.storage import LocalDocumentStore
from app.validation import validate_extraction

logger = logging.getLogger("billfixr.processing")


class ProcessingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repository = Repository(settings)
        self.store = LocalDocumentStore(settings)
        self.pipeline = ExtractionPipeline(settings, ExtractionProvider(settings))

    def process_document(
        self,
        *,
        case_id: UUID,
        document: StoredDocument,
        use_ai: bool,
    ) -> ProcessedDocument:
        self.repository.audit(
            event_type="document.processing_started",
            message="Document extraction started.",
            case_id=case_id,
            document_id=document.document_id,
            metadata={"filename": document.original_filename},
        )

        path = Path(document.storage_path)
        cleanup_path: Path | None = None
        if document.encrypted:
            cleanup_path = self._materialize_decrypted_document(document)
            path = cleanup_path

        try:
            response = self.pipeline.extract_from_file(
                case_id=case_id,
                document_id=document.document_id,
                path=path,
                use_ai=use_ai,
            )
            validation = validate_extraction(response.extraction)
            processed = ProcessedDocument(
                document=document,
                extraction=response.extraction,
                model_used=response.model_used,
                warnings=response.warnings,
                validation=validation,
            )
            self.repository.audit(
                event_type="document.processing_succeeded",
                message="Document extraction completed.",
                case_id=case_id,
                document_id=document.document_id,
                metadata={
                    "quality_score": validation.quality_score,
                    "needs_review": validation.needs_review,
                    "warnings": response.warnings,
                },
            )
            return processed
        finally:
            if cleanup_path:
                cleanup_path.unlink(missing_ok=True)

    def process_job(self, *, job_id: UUID, use_ai: bool, max_attempts: int = 3) -> None:
        job = self.repository.get_job(job_id)
        if not job:
            return

        attempts = job.attempts + 1
        self.repository.update_job(job_id=job_id, status=ProcessingStatus.running, attempts=attempts)
        self.repository.audit(
            event_type="job.running",
            message="Processing job started.",
            case_id=job.case_id,
            job_id=job_id,
            metadata={"attempt": attempts},
        )

        try:
            any_needs_review = False
            for document_id in job.document_ids:
                document = self.store.get_document(case_id=job.case_id, document_id=document_id)
                if not document:
                    raise RuntimeError(f"Document {document_id} not found for case {job.case_id}.")
                processed = self.process_document(case_id=job.case_id, document=document, use_ai=use_ai)
                any_needs_review = any_needs_review or bool(
                    processed.validation and processed.validation.needs_review
                )
                self.repository.save_processed_document(
                    job_id=job_id,
                    case_id=job.case_id,
                    processed_document=processed,
                )

            final_status = ProcessingStatus.needs_review if any_needs_review else ProcessingStatus.succeeded
            self.repository.update_job(job_id=job_id, status=final_status, attempts=attempts)
            self.repository.audit(
                event_type=f"job.{final_status}",
                message=f"Processing job finished with status {final_status}.",
                case_id=job.case_id,
                job_id=job_id,
            )
        except Exception as exc:
            status = ProcessingStatus.failed if attempts >= max_attempts else ProcessingStatus.queued
            self.repository.update_job(job_id=job_id, status=status, attempts=attempts, error=str(exc))
            self.repository.audit(
                event_type="job.failed" if status == ProcessingStatus.failed else "job.retry_queued",
                message=str(exc),
                case_id=job.case_id,
                job_id=job_id,
                metadata={"attempt": attempts, "max_attempts": max_attempts},
            )
            if status == ProcessingStatus.failed:
                raise

    def process_case(
        self,
        *,
        case_id: UUID,
        documents: list[StoredDocument],
        use_ai: bool,
    ) -> tuple[ProcessingJob, list[ProcessedDocument], CaseAnalysis, DraftCommunication]:
        job = self.repository.create_job(case_id=case_id, documents=documents)
        self.repository.audit(
            event_type="job.queued",
            message="Case processing job queued.",
            case_id=case_id,
            job_id=job.job_id,
            metadata={"document_count": len(documents)},
        )
        processed_documents: list[ProcessedDocument] = []
        any_needs_review = False

        self.repository.update_job(job_id=job.job_id, status=ProcessingStatus.running, attempts=1)
        for document in documents:
            processed = self.process_document(case_id=case_id, document=document, use_ai=use_ai)
            self.repository.save_processed_document(
                job_id=job.job_id,
                case_id=case_id,
                processed_document=processed,
            )
            processed_documents.append(processed)
            any_needs_review = any_needs_review or bool(
                processed.validation and processed.validation.needs_review
            )

        analysis = analyze_case(case_id=case_id, processed_documents=processed_documents)
        draft = draft_communication(analysis=analysis, processed_documents=processed_documents, user_notes=None)
        final_status = (
            ProcessingStatus.needs_review
            if any_needs_review or analysis.needs_human_review
            else ProcessingStatus.succeeded
        )
        self.repository.update_job(job_id=job.job_id, status=final_status, attempts=1)
        self.repository.audit(
            event_type="case.analysis_completed",
            message="Case analysis and draft generation completed.",
            case_id=case_id,
            job_id=job.job_id,
            metadata={
                "recommended_action": analysis.recommended_action.action_type,
                "needs_human_review": analysis.needs_human_review,
            },
        )
        updated_job = self.repository.get_job(job.job_id)
        if not updated_job:
            raise RuntimeError(f"Processing job {job.job_id} disappeared after case processing.")
        return updated_job, processed_documents, analysis, draft

    def process_queued_jobs(
        self,
        *,
        use_ai: bool,
        limit: int = 10,
        max_attempts: int = 3,
    ) -> int:
        jobs = self.repository.list_jobs(status=ProcessingStatus.queued, limit=limit)
        processed_count = 0
        for job in jobs:
            try:
                self.process_job(job_id=job.job_id, use_ai=use_ai, max_attempts=max_attempts)
            except Exception:
                # Terminal failures are persisted inside process_job; keep draining the queue.
                logger.exception("Queued job %s failed terminally during worker processing.", job.job_id)
            processed_count += 1
        return processed_count

    def _materialize_decrypted_document(self, document: StoredDocument) -> Path:
        self.settings.cache_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(document.original_filename).suffix or ".bin"
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix,
            dir=self.settings.cache_dir,
        ) as handle:
            handle.write(self.store.read_document(document))
            return Path(handle.name)
