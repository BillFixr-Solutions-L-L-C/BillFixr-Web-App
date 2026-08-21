import logging
import tempfile
import time
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.ai.provider import ExtractionProvider
from app.auth import Principal, ensure_owner_access, require_roles
from app.casework import analyze_case, draft_communication
from app.config import Settings, get_settings
from app.contracts import (
    AuditEvent,
    CaseAnalysisResponse,
    CaseProcessingResponse,
    DocumentIngestionResponse,
    DocumentProcessingResponse,
    DraftRequest,
    DraftResponse,
    EmailSyncRequest,
    EmailSyncResponse,
    ExtractionRequest,
    ExtractionResponse,
    HospitalPriceTransparencyLocation,
    IngestionSource,
    JobStatusResponse,
    JobSubmissionResponse,
    PricingSource,
    ProcessingStatus,
)
from app.ingestion.email_ingestor import EmailIngestor
from app.ingestion.pipeline import ExtractionPipeline
from app.logging_config import configure_logging
from app.pricing.sources import list_pricing_sources, parse_hospital_price_transparency_txt
from app.processing import ProcessingService
from app.repository import Repository
from app.storage import LocalDocumentStore

app = FastAPI(
    title="BillFixr AI Service",
    version="0.1.0",
    description="AI ingestion, OCR, and structured extraction service for medical bill negotiation.",
)
configure_logging(get_settings())
logger = logging.getLogger("billfixr.api")

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    logger.info(
        "request method=%s path=%s status=%s duration_ms=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


def get_store(settings: Settings = Depends(get_settings)) -> LocalDocumentStore:
    return LocalDocumentStore(settings)


def get_repository(settings: Settings = Depends(get_settings)) -> Repository:
    return Repository(settings)


def get_processing_service(settings: Settings = Depends(get_settings)) -> ProcessingService:
    return ProcessingService(settings)


@app.get("/", include_in_schema=False)
def demo_frontend() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/review", include_in_schema=False)
def review_frontend() -> FileResponse:
    return FileResponse(STATIC_DIR / "review.html")


@app.get("/demo/patient", include_in_schema=False)
def patient_demo_frontend() -> FileResponse:
    return FileResponse(STATIC_DIR / "patient-demo.html")


@app.get("/demo/story", include_in_schema=False)
def story_demo_frontend() -> FileResponse:
    return FileResponse(STATIC_DIR / "story-demo.html")


@app.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict[str, str | bool]:
    return {
        "status": "ok",
        "environment": settings.app_env,
        "ai_configured": bool(settings.openai_api_key or settings.openrouter_api_key),
        "ai_provider": "openrouter" if settings.openrouter_api_key else ("openai" if settings.openai_api_key else "none"),
        "ai_model": settings.openrouter_extraction_model if settings.openrouter_api_key else settings.openai_extraction_model,
        "ocr_enabled": settings.enable_ocr,
        "ocr_engine": settings.ocr_engine,
        "database_configured": bool(settings.database_path),
        "auth_enabled": bool(settings.local_api_key),
        "malware_scan_enabled": settings.malware_scan_enabled,
        "clamav_enabled": settings.clamav_enabled,
    }


@app.post("/v1/ingestion/documents", response_model=DocumentIngestionResponse)
async def ingest_documents(
    files: list[UploadFile] = File(...),
    case_id: UUID | None = Form(default=None),
    source: IngestionSource = Form(default=IngestionSource.upload),
    store: LocalDocumentStore = Depends(get_store),
    principal: Principal = Depends(require_roles("admin", "patient", "reviewer")),
) -> DocumentIngestionResponse:
    resolved_case_id = case_id or uuid4()
    documents = []
    for file in files:
        data = await file.read()
        try:
            _, stored = store.save_bytes(
                data=data,
                original_filename=file.filename or "upload.bin",
                source=source,
                content_type=file.content_type,
                case_id=resolved_case_id,
                owner_user_id=principal.user_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        documents.append(stored)
    return DocumentIngestionResponse(case_id=resolved_case_id, documents=documents)


@app.post("/v1/ingestion/documents/process", response_model=DocumentProcessingResponse)
async def ingest_and_process_documents(
    files: list[UploadFile] = File(...),
    case_id: UUID | None = Form(default=None),
    use_ai: bool = Form(default=True),
    store: LocalDocumentStore = Depends(get_store),
    service: ProcessingService = Depends(get_processing_service),
    principal: Principal = Depends(require_roles("admin", "patient", "reviewer")),
) -> DocumentProcessingResponse:
    resolved_case_id = case_id or uuid4()
    processed_documents = []

    for file in files:
        data = await file.read()
        try:
            _, document = store.save_bytes(
                data=data,
                original_filename=file.filename or "upload.bin",
                source=IngestionSource.upload,
                content_type=file.content_type,
                case_id=resolved_case_id,
                owner_user_id=principal.user_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        processed = service.process_document(
            case_id=resolved_case_id,
            document=document,
            use_ai=use_ai,
        )
        processed_documents.append(processed)

    return DocumentProcessingResponse(case_id=resolved_case_id, processed_documents=processed_documents)


@app.post("/v1/cases/process", response_model=CaseProcessingResponse)
async def process_case_documents(
    files: list[UploadFile] = File(...),
    case_id: UUID | None = Form(default=None),
    use_ai: bool = Form(default=True),
    store: LocalDocumentStore = Depends(get_store),
    service: ProcessingService = Depends(get_processing_service),
    principal: Principal = Depends(require_roles("admin", "patient", "reviewer")),
) -> CaseProcessingResponse:
    resolved_case_id = case_id or uuid4()
    documents = []
    for file in files:
        data = await file.read()
        try:
            _, document = store.save_bytes(
                data=data,
                original_filename=file.filename or "upload.bin",
                source=IngestionSource.upload,
                content_type=file.content_type,
                case_id=resolved_case_id,
                owner_user_id=principal.user_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        documents.append(document)

    job, processed_documents, analysis, draft = service.process_case(
        case_id=resolved_case_id,
        documents=documents,
        use_ai=use_ai,
    )
    return CaseProcessingResponse(
        case_id=resolved_case_id,
        job=job,
        processed_documents=processed_documents,
        analysis=analysis,
        draft=draft,
    )


@app.post("/v1/ingestion/documents/process-async", response_model=JobSubmissionResponse)
async def ingest_and_queue_documents(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    case_id: UUID | None = Form(default=None),
    use_ai: bool = Form(default=True),
    store: LocalDocumentStore = Depends(get_store),
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "patient", "reviewer")),
) -> JobSubmissionResponse:
    resolved_case_id = case_id or uuid4()
    documents = []
    for file in files:
        data = await file.read()
        try:
            _, document = store.save_bytes(
                data=data,
                original_filename=file.filename or "upload.bin",
                source=IngestionSource.upload,
                content_type=file.content_type,
                case_id=resolved_case_id,
                owner_user_id=principal.user_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        documents.append(document)

    job = repository.create_job(
        case_id=resolved_case_id,
        documents=documents,
        owner_user_id=principal.user_id,
    )
    repository.audit(
        event_type="job.queued",
        message="Processing job queued.",
        case_id=resolved_case_id,
        job_id=job.job_id,
        metadata={"document_count": len(documents)},
    )
    background_tasks.add_task(_run_job_background, job.job_id, use_ai)
    return JobSubmissionResponse(
        case_id=resolved_case_id,
        job_id=job.job_id,
        status=ProcessingStatus.queued,
        documents=documents,
    )


@app.post("/v1/ingestion/email/sync", response_model=EmailSyncResponse)
def sync_email(
    request: EmailSyncRequest,
    settings: Settings = Depends(get_settings),
    store: LocalDocumentStore = Depends(get_store),
    principal: Principal = Depends(require_roles("admin", "worker")),
) -> EmailSyncResponse:
    try:
        return EmailIngestor(settings, store).sync(request, owner_user_id=principal.user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/ingestion/email/message", response_model=EmailSyncResponse)
async def ingest_email_message(
    file: UploadFile = File(...),
    case_id: UUID | None = Form(default=None),
    dry_run: bool = Form(default=False),
    settings: Settings = Depends(get_settings),
    store: LocalDocumentStore = Depends(get_store),
    principal: Principal = Depends(require_roles("admin", "worker")),
) -> EmailSyncResponse:
    data = await file.read()
    return EmailIngestor(settings, store).parse_message_bytes(
        data,
        case_id=case_id,
        dry_run=dry_run,
        owner_user_id=principal.user_id,
    )


@app.get("/v1/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(
    job_id: UUID,
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "reviewer", "patient", "worker")),
) -> JobStatusResponse:
    job = repository.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    ensure_owner_access(principal, job.owner_user_id, resource_name="job")
    return JobStatusResponse(job=job, processed_documents=repository.list_processed_documents(job_id))


@app.get("/v1/jobs", response_model=list[JobStatusResponse])
def list_jobs(
    status: ProcessingStatus | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "reviewer", "worker")),
) -> list[JobStatusResponse]:
    return [
        JobStatusResponse(job=job, processed_documents=repository.list_processed_documents(job.job_id))
        for job in repository.list_jobs(status=status, limit=limit)
    ]


@app.post("/v1/jobs/{job_id}/run", response_model=JobStatusResponse)
def run_job_now(
    job_id: UUID,
    use_ai: bool = Query(default=True),
    service: ProcessingService = Depends(get_processing_service),
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "worker")),
) -> JobStatusResponse:
    job = repository.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    try:
        service.process_job(job_id=job_id, use_ai=use_ai)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    updated_job = repository.get_job(job_id)
    if not updated_job:
        raise HTTPException(status_code=404, detail="Job not found after processing.")
    return JobStatusResponse(
        job=updated_job,
        processed_documents=repository.list_processed_documents(job_id),
    )


@app.get("/v1/audit/events", response_model=list[AuditEvent])
def list_audit_events(
    case_id: UUID | None = None,
    job_id: UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "reviewer")),
) -> list[AuditEvent]:
    return repository.list_audit_events(case_id=case_id, job_id=job_id, limit=limit)


@app.get("/v1/review/queue", response_model=list[JobStatusResponse])
def review_queue(
    limit: int = Query(default=100, ge=1, le=500),
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "reviewer")),
) -> list[JobStatusResponse]:
    return [
        JobStatusResponse(job=job, processed_documents=repository.list_processed_documents(job.job_id))
        for job in repository.list_review_jobs(limit=limit)
    ]


@app.post("/v1/review/jobs/{job_id}/approve", response_model=JobStatusResponse)
def approve_review_job(
    job_id: UUID,
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "reviewer")),
) -> JobStatusResponse:
    job = repository.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    repository.update_job(job_id=job_id, status=ProcessingStatus.approved, attempts=job.attempts)
    repository.audit(
        event_type="job.approved",
        message="Job approved by reviewer.",
        case_id=job.case_id,
        job_id=job_id,
        metadata={"reviewer": principal.user_id, "role": principal.role},
    )
    updated_job = repository.get_job(job_id)
    if not updated_job:
        raise HTTPException(status_code=404, detail="Job not found after approval.")
    return JobStatusResponse(
        job=updated_job,
        processed_documents=repository.list_processed_documents(job_id),
    )


@app.post("/v1/extraction/bills", response_model=ExtractionResponse)
def extract_bill(
    request: ExtractionRequest,
    settings: Settings = Depends(get_settings),
    store: LocalDocumentStore = Depends(get_store),
    principal: Principal = Depends(require_roles("admin", "patient", "reviewer")),
) -> ExtractionResponse:
    provider = ExtractionProvider(settings)
    pipeline = ExtractionPipeline(settings, provider)

    if request.text:
        return pipeline.extract_from_text(
            case_id=request.case_id,
            text=request.text,
            use_ai=request.use_ai,
        )

    if request.document_id:
        document = store.get_document(case_id=request.case_id, document_id=request.document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Stored document was not found for this case.")
        ensure_owner_access(principal, document.owner_user_id, resource_name="document")
        if not document.encrypted:
            return pipeline.extract_from_file(
                case_id=request.case_id,
                document_id=request.document_id,
                path=Path(document.storage_path),
                use_ai=request.use_ai,
            )

        settings.cache_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(document.original_filename).suffix or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=settings.cache_dir) as handle:
            handle.write(store.read_document(document))
            temp_path = Path(handle.name)
        try:
            return pipeline.extract_from_file(
                case_id=request.case_id,
                document_id=request.document_id,
                path=temp_path,
                use_ai=request.use_ai,
            )
        finally:
            temp_path.unlink(missing_ok=True)

    raise HTTPException(status_code=400, detail="Provide either text or a stored document reference.")


@app.get("/v1/cases/{case_id}/analysis", response_model=CaseAnalysisResponse)
def get_case_analysis(
    case_id: UUID,
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "patient", "reviewer", "worker")),
) -> CaseAnalysisResponse:
    processed_documents = repository.list_processed_documents_for_case(
        case_id,
        owner_user_id=principal.user_id if principal.role == "patient" and principal.auth_enabled else None,
    )
    if not processed_documents:
        raise HTTPException(status_code=404, detail="No processed documents found for this case.")
    ensure_owner_access(principal, processed_documents[0].document.owner_user_id, resource_name="case")
    analysis = analyze_case(case_id=case_id, processed_documents=processed_documents)
    return CaseAnalysisResponse(
        case_id=case_id,
        processed_documents=processed_documents,
        analysis=analysis,
    )


@app.post("/v1/cases/{case_id}/drafts", response_model=DraftResponse)
def build_case_draft(
    case_id: UUID,
    request: DraftRequest,
    repository: Repository = Depends(get_repository),
    principal: Principal = Depends(require_roles("admin", "patient", "reviewer", "worker")),
) -> DraftResponse:
    processed_documents = repository.list_processed_documents_for_case(
        case_id,
        owner_user_id=principal.user_id if principal.role == "patient" and principal.auth_enabled else None,
    )
    if not processed_documents:
        raise HTTPException(status_code=404, detail="No processed documents found for this case.")
    ensure_owner_access(principal, processed_documents[0].document.owner_user_id, resource_name="case")
    analysis = analyze_case(case_id=case_id, processed_documents=processed_documents)
    draft = draft_communication(
        analysis=analysis,
        processed_documents=processed_documents,
        user_notes=request.user_notes,
        action_type_override=request.action_type,
    )
    return DraftResponse(case_id=case_id, analysis=analysis, draft=draft)


@app.get("/v1/pricing/sources", response_model=list[PricingSource])
def pricing_sources() -> list[PricingSource]:
    return list_pricing_sources()


@app.post("/v1/pricing/hospital-transparency/parse-txt", response_model=HospitalPriceTransparencyLocation)
def parse_hospital_transparency_txt(payload: dict[str, str]) -> HospitalPriceTransparencyLocation:
    text = payload.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Provide TXT file content in the 'text' field.")
    return parse_hospital_price_transparency_txt(text)


def _run_job_background(job_id: UUID, use_ai: bool) -> None:
    settings = get_settings()
    service = ProcessingService(settings)
    service.process_job(job_id=job_id, use_ai=use_ai)
