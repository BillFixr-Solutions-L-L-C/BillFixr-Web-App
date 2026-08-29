import imaplib
from datetime import UTC, datetime, timedelta
from email import message_from_bytes
from email.message import Message
from email.utils import parsedate_to_datetime
from uuid import UUID, uuid4

from app.config import Settings
from app.contracts import (
    EmailAttachmentResult,
    EmailSyncRequest,
    EmailSyncResponse,
    IngestionSource,
)
from app.storage import LocalDocumentStore


class EmailIngestor:
    def __init__(self, settings: Settings, store: LocalDocumentStore) -> None:
        self.settings = settings
        self.store = store
        self.supported_attachment_extensions = {
            extension.strip().lower()
            for extension in settings.allowed_upload_extensions.split(",")
            if extension.strip()
        }

    def sync(
        self,
        request: EmailSyncRequest,
        case_id: UUID | None = None,
        owner_user_id: str | None = None,
    ) -> EmailSyncResponse:
        if not self.settings.imap_host or not self.settings.imap_username or not self.settings.imap_password:
            raise RuntimeError("IMAP_HOST, IMAP_USERNAME, and IMAP_PASSWORD must be configured.")

        case_id = case_id or uuid4()
        mailbox = request.mailbox or self.settings.imap_mailbox
        lookback_days = request.lookback_days or self.settings.email_lookback_days
        since = (datetime.now(UTC) - timedelta(days=lookback_days)).strftime("%d-%b-%Y")

        results: list[EmailAttachmentResult] = []
        scanned_messages = 0

        with imaplib.IMAP4_SSL(self.settings.imap_host, self.settings.imap_port) as client:
            client.login(self.settings.imap_username, self.settings.imap_password)
            client.select(mailbox)
            _, data = client.search(None, f'(SINCE "{since}")')
            ids = data[0].split()[: request.max_messages] if data and data[0] else []

            for msg_id in ids:
                scanned_messages += 1
                _, msg_data = client.fetch(msg_id, "(RFC822)")
                if not msg_data or not isinstance(msg_data[0], tuple):
                    continue
                parsed = message_from_bytes(msg_data[0][1])
                result = self._extract_attachments(parsed, case_id, request.dry_run, owner_user_id)
                if result.attachments:
                    results.append(result)

        return EmailSyncResponse(
            case_id=case_id,
            scanned_messages=scanned_messages,
            matched_messages=len(results),
            results=results,
        )

    def parse_message_bytes(
        self,
        data: bytes,
        case_id: UUID | None = None,
        dry_run: bool = False,
        owner_user_id: str | None = None,
    ) -> EmailSyncResponse:
        resolved_case_id = case_id or uuid4()
        message = message_from_bytes(data)
        result = self._extract_attachments(message, resolved_case_id, dry_run, owner_user_id)
        return EmailSyncResponse(
            case_id=resolved_case_id,
            scanned_messages=1,
            matched_messages=1 if result.attachments else 0,
            results=[result] if result.attachments else [],
        )

    def _extract_attachments(
        self,
        message: Message,
        case_id: UUID,
        dry_run: bool,
        owner_user_id: str | None,
    ) -> EmailAttachmentResult:
        attachments = []
        for part in message.walk():
            disposition = part.get_content_disposition()
            filename = part.get_filename()
            if disposition != "attachment" or not filename:
                continue
            if not _is_supported_attachment(filename, self.supported_attachment_extensions):
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            if dry_run:
                continue
            _, stored = self.store.save_bytes(
                data=payload,
                original_filename=filename,
                source=IngestionSource.email,
                content_type=part.get_content_type(),
                case_id=case_id,
                owner_user_id=owner_user_id,
            )
            attachments.append(stored)

        return EmailAttachmentResult(
            message_id=message.get("Message-ID", ""),
            subject=message.get("Subject"),
            sender=message.get("From"),
            received_at=_parse_received_at(message.get("Date")),
            attachments=attachments,
        )


def _is_supported_attachment(filename: str, supported_extensions: set[str]) -> bool:
    lower = filename.lower()
    return any(lower.endswith(extension) for extension in supported_extensions)


def _parse_received_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None
