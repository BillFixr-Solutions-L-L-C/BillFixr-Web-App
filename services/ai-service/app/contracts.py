from datetime import UTC, date, datetime
from enum import StrEnum
from types import UnionType
from typing import Annotated, Any, Union, get_args, get_origin
from uuid import UUID, uuid4

from pydantic import BaseModel, BeforeValidator, Field, HttpUrl, model_validator

# Formats seen on real statements, in the order they are tried. Pydantic
# itself accepts only ISO-8601, and a bill writes "3/20/22".
_DATE_FORMATS = (
    "%m/%d/%Y",
    "%m/%d/%y",
    "%m-%d-%Y",
    "%m-%d-%y",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%B %d, %Y",
    "%b %d, %Y",
    "%d %B %Y",
    "%d %b %Y",
)


def _parse_loose_date(value: Any) -> Any:
    """Accept the date formats a document actually uses, drop the rest.

    An unparseable date must cost us that one field and nothing more. The
    extraction model returns dates as they appear on the page -- and on a
    redacted sample it returns the redaction itself, "XXXXXX". Raising
    there would fail validation for the whole document, and the service
    would silently fall back to the regex pass, discarding a complete and
    correct read over one bad date. That happened in production on
    2026-11-04: eight such errors threw away a full claim table.
    """
    if value is None or isinstance(value, date):
        return value
    if not isinstance(value, str):
        return value

    text = value.strip()
    if not text:
        return None

    try:
        return date.fromisoformat(text)
    except ValueError:
        pass

    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    # Not a date in any form we recognise -- a redaction placeholder, a
    # date range, a footnote marker. Treat it as absent.
    return None


LooseDate = Annotated[date | None, BeforeValidator(_parse_loose_date)]


def _allows_none(annotation: Any) -> bool:
    if annotation is None or annotation is type(None):
        return True
    origin = get_origin(annotation)
    if origin is Annotated:
        return _allows_none(get_args(annotation)[0])
    if origin in (Union, UnionType):
        return any(_allows_none(arg) for arg in get_args(annotation))
    return False


class ModelOutput(BaseModel):
    """A model that tolerates an explicit `null` where it has a default.

    The extraction model fills the schema it is given and writes `null`
    for anything it has no answer for -- including fields that are not
    optional but do have a default, like `currency: str = "USD"` and
    `confidence: float = 0.0`. Pydantic rejects those nulls, and the
    pipeline catches the error and falls back to the regex pass, so one
    stray null discards an otherwise complete read of a bill.

    Fixing such fields one at a time does not hold: on 2026-11-04 the
    same document failed first on four dates and three confidences, and
    then, once those were handled, on a single `"currency": null` the
    model had not sent the time before. Treating null as "no value
    supplied" wherever a default exists is the rule that covers the next
    field too.

    A null on a genuinely optional field still means null, and a null on
    a required field with no default is still an error.
    """

    @model_validator(mode="before")
    @classmethod
    def _null_means_default(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        dropped = {}
        for name, field in cls.model_fields.items():
            for key in {name, field.alias} - {None}:
                if data.get(key, ...) is None and not _allows_none(field.annotation):
                    if field.is_required():
                        continue
                    dropped[key] = None

        if not dropped:
            return data
        return {key: value for key, value in data.items() if key not in dropped}


class DocumentType(StrEnum):
    hospital_bill = "hospital_bill"
    explanation_of_benefits = "explanation_of_benefits"
    collection_letter = "collection_letter"
    financial_assistance_form = "financial_assistance_form"
    email_correspondence = "email_correspondence"
    unknown = "unknown"


class IngestionSource(StrEnum):
    upload = "upload"
    email = "email"
    n8n = "n8n"


class ProcessingStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    needs_review = "needs_review"
    approved = "approved"


class MalwareScanStatus(StrEnum):
    pending = "pending"
    clean = "clean"
    rejected = "rejected"
    skipped = "skipped"


class ValidationSeverity(StrEnum):
    info = "info"
    warning = "warning"
    error = "error"


class MoneyAmount(ModelOutput):
    amount: float | None = None
    currency: str = "USD"


class BillLineItem(ModelOutput):
    description: str | None = None
    service_code: str | None = Field(default=None, description="CPT, HCPCS, revenue code, or local code.")
    service_date: LooseDate = None
    quantity: float | None = None
    charge: MoneyAmount = Field(default_factory=MoneyAmount)
    patient_responsibility: MoneyAmount = Field(default_factory=MoneyAmount)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class Party(ModelOutput):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None


class MedicalBillExtraction(ModelOutput):
    document_type: DocumentType = DocumentType.unknown
    patient: Party = Field(default_factory=Party)
    provider: Party = Field(default_factory=Party)
    insurer: Party = Field(default_factory=Party)
    account_number: str | None = None
    claim_number: str | None = None
    statement_date: LooseDate = None
    due_date: LooseDate = None
    date_of_service_start: LooseDate = None
    date_of_service_end: LooseDate = None
    total_charges: MoneyAmount = Field(default_factory=MoneyAmount)
    insurance_paid: MoneyAmount = Field(default_factory=MoneyAmount)
    adjustments: MoneyAmount = Field(default_factory=MoneyAmount)
    patient_responsibility: MoneyAmount = Field(default_factory=MoneyAmount)
    line_items: list[BillLineItem] = Field(default_factory=list)
    detected_issues: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    raw_text_excerpt: str | None = Field(default=None, max_length=4000)


class StoredDocument(BaseModel):
    document_id: UUID = Field(default_factory=uuid4)
    source: IngestionSource
    original_filename: str
    content_type: str | None = None
    owner_user_id: str | None = None
    storage_path: str
    sha256: str
    byte_size: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    encrypted: bool = False
    malware_scan_status: MalwareScanStatus = MalwareScanStatus.skipped


class DocumentIngestionResponse(BaseModel):
    case_id: UUID
    documents: list[StoredDocument]


class EmailSyncRequest(BaseModel):
    mailbox: str | None = None
    lookback_days: int | None = Field(default=None, ge=1, le=60)
    max_messages: int = Field(default=25, ge=1, le=250)
    dry_run: bool = False


class EmailAttachmentResult(BaseModel):
    message_id: str
    subject: str | None = None
    sender: str | None = None
    received_at: datetime | None = None
    attachments: list[StoredDocument] = Field(default_factory=list)


class EmailSyncResponse(BaseModel):
    case_id: UUID
    scanned_messages: int
    matched_messages: int
    results: list[EmailAttachmentResult]


class ExtractionRequest(BaseModel):
    case_id: UUID
    document_id: UUID | None = None
    text: str | None = None
    use_ai: bool = True


class ExtractionResponse(BaseModel):
    case_id: UUID
    document_id: UUID | None = None
    extraction: MedicalBillExtraction
    model_used: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ValidationFinding(BaseModel):
    field: str
    severity: ValidationSeverity
    message: str


class ValidationReport(BaseModel):
    quality_score: float = Field(ge=0.0, le=1.0)
    needs_review: bool
    findings: list[ValidationFinding] = Field(default_factory=list)


class ProcessedDocument(BaseModel):
    document: StoredDocument
    extraction: MedicalBillExtraction
    model_used: str | None = None
    warnings: list[str] = Field(default_factory=list)
    validation: ValidationReport | None = None


class DocumentProcessingResponse(BaseModel):
    case_id: UUID
    processed_documents: list[ProcessedDocument]


class ProcessingJob(BaseModel):
    job_id: UUID
    case_id: UUID
    owner_user_id: str | None = None
    status: ProcessingStatus
    document_ids: list[UUID] = Field(default_factory=list)
    attempts: int = 0
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class JobSubmissionResponse(BaseModel):
    case_id: UUID
    job_id: UUID
    status: ProcessingStatus
    documents: list[StoredDocument]


class JobStatusResponse(BaseModel):
    job: ProcessingJob
    processed_documents: list[ProcessedDocument] = Field(default_factory=list)


class AuditEvent(BaseModel):
    event_id: UUID
    case_id: UUID | None = None
    document_id: UUID | None = None
    job_id: UUID | None = None
    event_type: str
    message: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class PricingSource(BaseModel):
    name: str
    source_type: str
    owner: str
    url: HttpUrl
    use_case: str
    update_frequency: str | None = None
    notes: str | None = None


class HospitalPriceTransparencyLocation(BaseModel):
    hospital_name: str | None = None
    source_page_url: str | None = None
    machine_readable_file_url: str | None = None
    contact: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: str
    detail: Any | None = None


class AuditIssueCategory(StrEnum):
    unsupported_document = "unsupported_document"
    missing_account_number = "missing_account_number"
    missing_patient_responsibility = "missing_patient_responsibility"
    possible_insurance_reconciliation_gap = "possible_insurance_reconciliation_gap"
    collections_escalation = "collections_escalation"
    financial_assistance_opportunity = "financial_assistance_opportunity"
    low_confidence_extraction = "low_confidence_extraction"
    duplicate_balance_suspected = "duplicate_balance_suspected"
    missing_adjustments = "missing_adjustments"
    high_patient_balance = "high_patient_balance"


class RecommendedActionType(StrEnum):
    human_review = "human_review"
    request_corrected_statement = "request_corrected_statement"
    request_itemized_bill = "request_itemized_bill"
    request_debt_validation = "request_debt_validation"
    request_financial_assistance = "request_financial_assistance"
    request_payment_plan = "request_payment_plan"
    await_supporting_documents = "await_supporting_documents"


class AuditIssue(ModelOutput):
    category: AuditIssueCategory
    severity: ValidationSeverity
    summary: str
    evidence: list[str] = Field(default_factory=list)


class SavingsOpportunity(ModelOutput):
    category: AuditIssueCategory
    title: str
    rationale: str
    estimated_savings: MoneyAmount = Field(default_factory=MoneyAmount)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)


class CaseFinancialSummary(BaseModel):
    total_charges: MoneyAmount = Field(default_factory=MoneyAmount)
    insurance_paid: MoneyAmount = Field(default_factory=MoneyAmount)
    adjustments: MoneyAmount = Field(default_factory=MoneyAmount)
    patient_responsibility: MoneyAmount = Field(default_factory=MoneyAmount)
    outstanding_balance: MoneyAmount = Field(default_factory=MoneyAmount)
    document_count_with_amounts: int = 0


class RecommendedAction(BaseModel):
    action_type: RecommendedActionType
    title: str
    rationale: str
    required_documents: list[str] = Field(default_factory=list)
    automation_ready: bool = False


class CaseAnalysis(BaseModel):
    case_id: UUID
    document_count: int
    document_types: list[DocumentType] = Field(default_factory=list)
    needs_human_review: bool
    confidence_score: float = Field(ge=0.0, le=1.0)
    summary: str
    financial_summary: CaseFinancialSummary = Field(default_factory=CaseFinancialSummary)
    issues: list[AuditIssue] = Field(default_factory=list)
    savings_opportunities: list[SavingsOpportunity] = Field(default_factory=list)
    recommended_action: RecommendedAction


class DraftCommunication(BaseModel):
    subject: str
    recipient_type: str
    body: str
    tone: str = "professional"
    send_channel: str = "email"


class CaseProcessingResponse(BaseModel):
    case_id: UUID
    job: ProcessingJob
    processed_documents: list[ProcessedDocument]
    analysis: CaseAnalysis
    draft: DraftCommunication | None = None


class CaseAnalysisResponse(BaseModel):
    case_id: UUID
    processed_documents: list[ProcessedDocument]
    analysis: CaseAnalysis


class DraftRequest(BaseModel):
    case_id: UUID
    action_type: RecommendedActionType | None = None
    user_notes: str | None = None


class DraftResponse(BaseModel):
    case_id: UUID
    analysis: CaseAnalysis
    draft: DraftCommunication
