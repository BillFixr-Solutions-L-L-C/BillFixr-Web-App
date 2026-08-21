from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from app.contracts import (
    AuditIssue,
    AuditIssueCategory,
    CaseAnalysis,
    CaseFinancialSummary,
    DocumentType,
    DraftCommunication,
    MoneyAmount,
    ProcessedDocument,
    RecommendedAction,
    RecommendedActionType,
    SavingsOpportunity,
    ValidationSeverity,
)


@dataclass(slots=True)
class _CaseFacts:
    total_charges: float = 0.0
    insurance_paid: float = 0.0
    adjustments: float = 0.0
    patient_responsibility: float = 0.0
    amounts_seen: int = 0
    hospital_bill_patient_responsibility: float = 0.0
    eob_patient_responsibility: float = 0.0
    duplicate_groups: dict[tuple[str, str, str, str], list[ProcessedDocument]] | None = None


def analyze_case(*, case_id: UUID, processed_documents: list[ProcessedDocument]) -> CaseAnalysis:
    document_types = [document.extraction.document_type for document in processed_documents]
    issues: list[AuditIssue] = []
    savings_opportunities: list[SavingsOpportunity] = []
    confidence_score = 1.0
    needs_human_review = False
    facts = _collect_case_facts(processed_documents)

    for processed in processed_documents:
        extraction = processed.extraction
        validation = processed.validation
        confidence_score = min(confidence_score, extraction.confidence or 0.35)

        if validation:
            confidence_score = min(confidence_score, validation.quality_score)
            needs_human_review = needs_human_review or validation.needs_review

        if extraction.document_type == DocumentType.unknown:
            issues.append(
                AuditIssue(
                    category=AuditIssueCategory.unsupported_document,
                    severity=ValidationSeverity.error,
                    summary="One document could not be mapped to a supported medical billing document type.",
                    evidence=[processed.document.original_filename],
                )
            )

        if extraction.document_type == DocumentType.collection_letter:
            issues.append(
                AuditIssue(
                    category=AuditIssueCategory.collections_escalation,
                    severity=ValidationSeverity.warning,
                    summary="The case includes a collections document and needs a debt-validation workflow.",
                    evidence=[processed.document.original_filename],
                )
            )

        if extraction.document_type == DocumentType.hospital_bill and extraction.account_number is None:
            issues.append(
                AuditIssue(
                    category=AuditIssueCategory.missing_account_number,
                    severity=ValidationSeverity.warning,
                    summary="The hospital bill is missing an account number and should stay reviewable.",
                    evidence=[processed.document.original_filename],
                )
            )

        if extraction.document_type == DocumentType.hospital_bill and extraction.patient_responsibility.amount is None:
            issues.append(
                AuditIssue(
                    category=AuditIssueCategory.missing_patient_responsibility,
                    severity=ValidationSeverity.warning,
                    summary="The patient responsibility amount is missing from at least one hospital bill.",
                    evidence=[processed.document.original_filename],
                )
            )

        if _is_low_confidence(processed):
            issues.append(
                AuditIssue(
                    category=AuditIssueCategory.low_confidence_extraction,
                    severity=ValidationSeverity.warning,
                    summary="At least one document was extracted with limited confidence and should remain reviewable.",
                    evidence=[processed.document.original_filename],
                )
            )

        if _has_missing_adjustments(processed):
            issues.append(
                AuditIssue(
                    category=AuditIssueCategory.missing_adjustments,
                    severity=ValidationSeverity.info,
                    summary="The bill shows charges and payments but no clear adjustments, so reconciliation should verify contractual write-offs.",
                    evidence=[processed.document.original_filename],
                )
            )

    issues.extend(_detect_duplicate_balances(processed_documents, facts))
    issues.extend(_detect_reconciliation_gaps(processed_documents))
    issues.extend(_detect_high_balance(processed_documents))

    if _looks_like_uninsured_or_self_pay(processed_documents):
        issues.append(
            AuditIssue(
                category=AuditIssueCategory.financial_assistance_opportunity,
                severity=ValidationSeverity.info,
                summary="The case looks like a self-pay or under-supported balance and may qualify for financial assistance screening.",
                evidence=_hospital_bill_filenames(processed_documents),
            )
        )

    savings_opportunities.extend(_build_reconciliation_savings(processed_documents))
    savings_opportunities.extend(_build_duplicate_savings(facts))
    savings_opportunities.extend(_build_self_pay_savings(processed_documents))

    issues = _dedupe_issues(issues)
    savings_opportunities = _dedupe_savings(savings_opportunities)
    financial_summary = _build_financial_summary(facts)
    recommendation = _recommend_action(document_types, issues)
    summary = _summarize_case(document_types, issues, recommendation, financial_summary, savings_opportunities)

    return CaseAnalysis(
        case_id=case_id,
        document_count=len(processed_documents),
        document_types=document_types,
        needs_human_review=needs_human_review or recommendation.action_type == RecommendedActionType.human_review,
        confidence_score=round(confidence_score, 2),
        summary=summary,
        financial_summary=financial_summary,
        issues=issues,
        savings_opportunities=savings_opportunities,
        recommended_action=recommendation,
    )


def draft_communication(
    *,
    analysis: CaseAnalysis,
    processed_documents: list[ProcessedDocument],
    user_notes: str | None,
    action_type_override: RecommendedActionType | None = None,
) -> DraftCommunication:
    provider_name = _first_provider_name(processed_documents) or "Hospital Billing Department"
    patient_name = _first_patient_name(processed_documents) or "the patient"
    account_number = _first_account_number(processed_documents) or "not provided"
    notes = f"\n\nAdditional notes from case owner:\n{user_notes.strip()}" if user_notes and user_notes.strip() else ""
    action_type = action_type_override or analysis.recommended_action.action_type
    savings_line = _draft_savings_line(analysis)

    if action_type == RecommendedActionType.request_debt_validation:
        return DraftCommunication(
            subject="Request for debt validation and account documentation",
            recipient_type="collection_agency",
            body=(
                f"Hello,\n\nI am writing regarding a medical debt communication associated with {patient_name}. "
                f"Please provide validation of the debt, the originating provider details, and any account reference you have on file. "
                f"My current reference is {account_number}.\n\n"
                "Please pause collection activity while this validation request is under review."
                f"{savings_line}{notes}"
            ),
        )

    if action_type == RecommendedActionType.request_financial_assistance:
        return DraftCommunication(
            subject="Request for financial assistance review",
            recipient_type="hospital_billing",
            body=(
                f"Hello {provider_name},\n\nI am requesting a financial assistance review for {patient_name}. "
                f"The current account reference is {account_number}. Please send the hardship or charity-care process, required documents, "
                "and any temporary hold options while the review is pending."
                f"{savings_line}{notes}"
            ),
        )

    if action_type == RecommendedActionType.request_corrected_statement:
        return DraftCommunication(
            subject="Request for corrected medical billing statement",
            recipient_type="hospital_billing",
            body=(
                f"Hello {provider_name},\n\nI am requesting a corrected statement for {patient_name}. "
                f"The case references account {account_number}. The bill appears to need reconciliation against insurance or supporting billing records. "
                "Please send an updated statement and itemization of the current balance."
                f"{savings_line}{notes}"
            ),
        )

    if action_type == RecommendedActionType.request_itemized_bill:
        return DraftCommunication(
            subject="Request for itemized medical bill",
            recipient_type="hospital_billing",
            body=(
                f"Hello {provider_name},\n\nPlease provide an itemized bill and complete account details for {patient_name}. "
                f"The current account reference available to me is {account_number}. I need the service-level charges, adjustments, and remaining patient balance."
                f"{savings_line}{notes}"
            ),
        )

    if action_type == RecommendedActionType.request_payment_plan:
        return DraftCommunication(
            subject="Request for payment plan options",
            recipient_type="hospital_billing",
            body=(
                f"Hello {provider_name},\n\nI am requesting payment plan options for {patient_name} regarding account {account_number}. "
                "Please send the available monthly plan terms, any self-pay discounts, and whether the balance can be placed on hold while options are reviewed."
                f"{savings_line}{notes}"
            ),
        )

    return DraftCommunication(
        subject="Case requires manual review",
        recipient_type="internal_review",
        body=(
            "This case should remain in manual review before an outbound communication is sent. "
            "The current document set is incomplete, unsupported, or still missing required identifiers."
            f"{savings_line}{notes}"
        ),
        send_channel="internal_note",
    )


def _collect_case_facts(processed_documents: list[ProcessedDocument]) -> _CaseFacts:
    facts = _CaseFacts(duplicate_groups=defaultdict(list))
    for processed in processed_documents:
        extraction = processed.extraction
        totals = (
            extraction.total_charges.amount,
            extraction.insurance_paid.amount,
            extraction.adjustments.amount,
            extraction.patient_responsibility.amount,
        )
        if any(amount is not None for amount in totals):
            facts.amounts_seen += 1
        facts.total_charges += extraction.total_charges.amount or 0.0
        facts.insurance_paid += extraction.insurance_paid.amount or 0.0
        facts.adjustments += extraction.adjustments.amount or 0.0
        facts.patient_responsibility += extraction.patient_responsibility.amount or 0.0
        if extraction.document_type == DocumentType.hospital_bill:
            facts.hospital_bill_patient_responsibility += extraction.patient_responsibility.amount or 0.0
        if extraction.document_type == DocumentType.explanation_of_benefits:
            facts.eob_patient_responsibility += extraction.patient_responsibility.amount or 0.0

        if extraction.document_type != DocumentType.hospital_bill:
            continue
        if extraction.patient_responsibility.amount is None:
            continue
        key = (
            extraction.account_number or "missing-account",
            extraction.patient.name or "missing-patient",
            extraction.provider.name or "missing-provider",
            str(extraction.patient_responsibility.amount),
        )
        facts.duplicate_groups[key].append(processed)
    return facts


def _build_financial_summary(facts: _CaseFacts) -> CaseFinancialSummary:
    visible_patient_responsibility = (
        facts.hospital_bill_patient_responsibility
        if facts.hospital_bill_patient_responsibility
        else facts.patient_responsibility
    )
    return CaseFinancialSummary(
        total_charges=MoneyAmount(amount=round(facts.total_charges, 2)),
        insurance_paid=MoneyAmount(amount=round(facts.insurance_paid, 2)),
        adjustments=MoneyAmount(amount=round(facts.adjustments, 2)),
        patient_responsibility=MoneyAmount(amount=round(visible_patient_responsibility, 2)),
        outstanding_balance=MoneyAmount(amount=round(visible_patient_responsibility, 2)),
        document_count_with_amounts=facts.amounts_seen,
    )


def _detect_duplicate_balances(processed_documents: list[ProcessedDocument], facts: _CaseFacts) -> list[AuditIssue]:
    issues: list[AuditIssue] = []
    for duplicates in (facts.duplicate_groups or {}).values():
        if len(duplicates) < 2:
            continue
        evidence = [item.document.original_filename for item in duplicates]
        issues.append(
            AuditIssue(
                category=AuditIssueCategory.duplicate_balance_suspected,
                severity=ValidationSeverity.warning,
                summary="Multiple hospital bills appear to carry the same balance and should be reviewed for duplicate billing.",
                evidence=evidence,
            )
        )
    return issues


def _detect_reconciliation_gaps(processed_documents: list[ProcessedDocument]) -> list[AuditIssue]:
    bill_amounts = [
        processed.extraction.patient_responsibility.amount
        for processed in processed_documents
        if processed.extraction.document_type == DocumentType.hospital_bill
        and processed.extraction.patient_responsibility.amount is not None
    ]
    eob_amounts = [
        processed.extraction.patient_responsibility.amount
        for processed in processed_documents
        if processed.extraction.document_type == DocumentType.explanation_of_benefits
        and processed.extraction.patient_responsibility.amount is not None
    ]
    if not bill_amounts or not eob_amounts:
        return []

    bill_amount = max(bill_amounts)
    eob_amount = max(eob_amounts)
    gap = round(bill_amount - eob_amount, 2)
    if gap <= 25:
        return []

    evidence = [item.document.original_filename for item in processed_documents if item.extraction.document_type in {DocumentType.hospital_bill, DocumentType.explanation_of_benefits}]
    return [
        AuditIssue(
            category=AuditIssueCategory.possible_insurance_reconciliation_gap,
            severity=ValidationSeverity.warning,
            summary="The hospital bill balance is materially higher than the EOB responsibility and should be reconciled before payment.",
            evidence=evidence,
        )
    ]


def _detect_high_balance(processed_documents: list[ProcessedDocument]) -> list[AuditIssue]:
    issues: list[AuditIssue] = []
    for processed in processed_documents:
        extraction = processed.extraction
        patient_amount = extraction.patient_responsibility.amount
        if extraction.document_type != DocumentType.hospital_bill or patient_amount is None:
            continue
        if patient_amount >= 1000:
            issues.append(
                AuditIssue(
                    category=AuditIssueCategory.high_patient_balance,
                    severity=ValidationSeverity.info,
                    summary="The patient balance is high enough to justify negotiation, hardship screening, or payment-plan review.",
                    evidence=[processed.document.original_filename],
                )
            )
    return issues


def _build_reconciliation_savings(processed_documents: list[ProcessedDocument]) -> list[SavingsOpportunity]:
    bill_amounts = [
        processed.extraction.patient_responsibility.amount
        for processed in processed_documents
        if processed.extraction.document_type == DocumentType.hospital_bill
        and processed.extraction.patient_responsibility.amount is not None
    ]
    eob_amounts = [
        processed.extraction.patient_responsibility.amount
        for processed in processed_documents
        if processed.extraction.document_type == DocumentType.explanation_of_benefits
        and processed.extraction.patient_responsibility.amount is not None
    ]
    if not bill_amounts or not eob_amounts:
        return []

    gap = round(max(bill_amounts) - max(eob_amounts), 2)
    if gap <= 25:
        return []

    evidence = [item.document.original_filename for item in processed_documents if item.extraction.document_type in {DocumentType.hospital_bill, DocumentType.explanation_of_benefits}]
    return [
        SavingsOpportunity(
            category=AuditIssueCategory.possible_insurance_reconciliation_gap,
            title="Insurance-versus-provider balance gap",
            rationale="The provider bill exceeds the patient responsibility visible in the EOB. That gap is a supportable savings target if the statement is corrected.",
            estimated_savings=MoneyAmount(amount=gap),
            confidence=0.84,
            evidence=evidence,
        )
    ]


def _build_duplicate_savings(facts: _CaseFacts) -> list[SavingsOpportunity]:
    opportunities: list[SavingsOpportunity] = []
    for duplicates in (facts.duplicate_groups or {}).values():
        if len(duplicates) < 2:
            continue
        duplicate_amount = duplicates[0].extraction.patient_responsibility.amount
        if duplicate_amount is None:
            continue
        opportunities.append(
            SavingsOpportunity(
                category=AuditIssueCategory.duplicate_balance_suspected,
                title="Possible duplicate balance",
                rationale="The same patient-facing balance appears on multiple hospital bills, which may indicate a duplicate billing record.",
                estimated_savings=MoneyAmount(amount=round(duplicate_amount, 2)),
                confidence=0.78,
                evidence=[item.document.original_filename for item in duplicates],
            )
        )
    return opportunities


def _build_self_pay_savings(processed_documents: list[ProcessedDocument]) -> list[SavingsOpportunity]:
    opportunities: list[SavingsOpportunity] = []
    for processed in processed_documents:
        extraction = processed.extraction
        patient_amount = extraction.patient_responsibility.amount
        if (
            extraction.document_type == DocumentType.hospital_bill
            and patient_amount is not None
            and patient_amount >= 1000
            and extraction.insurance_paid.amount in {None, 0}
        ):
            opportunities.append(
                SavingsOpportunity(
                    category=AuditIssueCategory.financial_assistance_opportunity,
                    title="Financial assistance or self-pay screening",
                    rationale="This looks like a self-pay balance. Savings are likely available, but the exact amount depends on the provider's assistance policy.",
                    estimated_savings=MoneyAmount(amount=None),
                    confidence=0.55,
                    evidence=[processed.document.original_filename],
                )
            )
    return opportunities


def _recommend_action(document_types: list[DocumentType], issues: list[AuditIssue]) -> RecommendedAction:
    issue_categories = {issue.category for issue in issues}

    if AuditIssueCategory.unsupported_document in issue_categories:
        return RecommendedAction(
            action_type=RecommendedActionType.human_review,
            title="Route to human review",
            rationale="At least one document is unsupported or insufficiently classified.",
            required_documents=["Supported medical bill or EOB"],
            automation_ready=False,
        )

    if AuditIssueCategory.collections_escalation in issue_categories:
        return RecommendedAction(
            action_type=RecommendedActionType.request_debt_validation,
            title="Request debt validation",
            rationale="Collections language is present, so the first outbound step should validate the debt and source records.",
            required_documents=["Collection letter", "Original hospital statement if available"],
            automation_ready=True,
        )

    if AuditIssueCategory.possible_insurance_reconciliation_gap in issue_categories:
        return RecommendedAction(
            action_type=RecommendedActionType.request_corrected_statement,
            title="Request corrected statement",
            rationale="Bill and EOB evidence disagree on patient responsibility and should be reconciled before negotiation continues.",
            required_documents=["Hospital bill", "EOB"],
            automation_ready=True,
        )

    if AuditIssueCategory.duplicate_balance_suspected in issue_categories:
        return RecommendedAction(
            action_type=RecommendedActionType.request_corrected_statement,
            title="Request duplicate-billing review",
            rationale="The same balance appears on multiple bills and should be reviewed before payment continues.",
            required_documents=["Matching hospital bills", "Any EOB or payment history"],
            automation_ready=True,
        )

    if AuditIssueCategory.financial_assistance_opportunity in issue_categories:
        return RecommendedAction(
            action_type=RecommendedActionType.request_financial_assistance,
            title="Start financial assistance workflow",
            rationale="The balance appears under-supported by insurer data and should be screened for hardship or charity-care options.",
            required_documents=["Income proof", "Hospital statement"],
            automation_ready=True,
        )

    if AuditIssueCategory.missing_account_number in issue_categories:
        return RecommendedAction(
            action_type=RecommendedActionType.request_itemized_bill,
            title="Request itemized bill and full account identifiers",
            rationale="The billing record is incomplete without an account number and should stay review-oriented.",
            required_documents=["Hospital bill image or PDF"],
            automation_ready=True,
        )

    if DocumentType.hospital_bill in document_types:
        return RecommendedAction(
            action_type=RecommendedActionType.request_payment_plan,
            title="Offer payment-plan or settlement path",
            rationale="The bill is sufficiently identified for payment-plan or settlement outreach.",
            required_documents=["Hospital bill"],
            automation_ready=True,
        )

    return RecommendedAction(
        action_type=RecommendedActionType.await_supporting_documents,
        title="Wait for supporting documents",
        rationale="The current case does not contain enough structured billing evidence to automate the next step.",
        required_documents=["Hospital bill or EOB"],
        automation_ready=False,
    )


def _summarize_case(
    document_types: list[DocumentType],
    issues: list[AuditIssue],
    recommendation: RecommendedAction,
    financial_summary: CaseFinancialSummary,
    savings_opportunities: list[SavingsOpportunity],
) -> str:
    if not document_types:
        return "No processed billing documents are available for analysis."

    issue_text = issues[0].summary if issues else "No major extraction issue was detected."
    doc_text = ", ".join(document_type.value for document_type in document_types)
    patient_balance = financial_summary.patient_responsibility.amount
    savings_text = ""
    first_savings = savings_opportunities[0].estimated_savings.amount if savings_opportunities else None
    if first_savings is not None:
        savings_text = f" Estimated savings target: ${first_savings:,.2f}."
    elif savings_opportunities:
        savings_text = " A savings opportunity is present but needs policy-specific review."
    balance_text = ""
    if patient_balance is not None:
        balance_text = f" Visible patient balance: ${patient_balance:,.2f}."
    return (
        f"Case includes {len(document_types)} processed document(s): {doc_text}. "
        f"Primary issue: {issue_text} Next action: {recommendation.title}.{balance_text}{savings_text}"
    )


def _is_low_confidence(processed: ProcessedDocument) -> bool:
    validation = processed.validation
    return bool(validation and validation.quality_score < 0.75)


def _has_missing_adjustments(processed: ProcessedDocument) -> bool:
    extraction = processed.extraction
    return bool(
        extraction.document_type == DocumentType.hospital_bill
        and extraction.total_charges.amount not in {None, 0}
        and extraction.insurance_paid.amount not in {None, 0}
        and extraction.adjustments.amount is None
    )


def _looks_like_uninsured_or_self_pay(processed_documents: list[ProcessedDocument]) -> bool:
    for processed in processed_documents:
        extraction = processed.extraction
        if (
            extraction.document_type == DocumentType.hospital_bill
            and extraction.insurance_paid.amount in {None, 0}
            and extraction.patient_responsibility.amount
            and extraction.patient_responsibility.amount >= 1000
        ):
            return True
    return False


def _hospital_bill_filenames(processed_documents: list[ProcessedDocument]) -> list[str]:
    return [
        processed.document.original_filename
        for processed in processed_documents
        if processed.extraction.document_type == DocumentType.hospital_bill
    ]


def _dedupe_issues(issues: list[AuditIssue]) -> list[AuditIssue]:
    seen: set[tuple[str, str]] = set()
    deduped: list[AuditIssue] = []
    for issue in issues:
        key = (issue.category, issue.summary)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(issue)
    return deduped


def _dedupe_savings(opportunities: list[SavingsOpportunity]) -> list[SavingsOpportunity]:
    seen: set[tuple[str, str]] = set()
    deduped: list[SavingsOpportunity] = []
    for opportunity in opportunities:
        key = (opportunity.category, opportunity.title)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(opportunity)
    return deduped


def _draft_savings_line(analysis: CaseAnalysis) -> str:
    if not analysis.savings_opportunities:
        return ""
    first = analysis.savings_opportunities[0]
    if first.estimated_savings.amount is not None:
        return f"\n\nThe current case review suggests a potential disputed or negotiable amount of ${first.estimated_savings.amount:,.2f}."
    return "\n\nThe current case review suggests there may be a negotiable savings opportunity, but the amount still needs manual confirmation."


def _first_provider_name(processed_documents: list[ProcessedDocument]) -> str | None:
    for processed in processed_documents:
        if processed.extraction.provider.name:
            return processed.extraction.provider.name
    return None


def _first_patient_name(processed_documents: list[ProcessedDocument]) -> str | None:
    for processed in processed_documents:
        if processed.extraction.patient.name:
            return processed.extraction.patient.name
    return None


def _first_account_number(processed_documents: list[ProcessedDocument]) -> str | None:
    for processed in processed_documents:
        if processed.extraction.account_number:
            return processed.extraction.account_number
    return None
