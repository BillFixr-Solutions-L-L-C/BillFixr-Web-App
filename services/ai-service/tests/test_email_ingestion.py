from email.message import EmailMessage
from pathlib import Path

from app.config import Settings
from app.ingestion.email_ingestor import EmailIngestor
from app.storage import LocalDocumentStore


def test_parse_message_bytes_saves_supported_attachments(tmp_path: Path) -> None:
    message = EmailMessage()
    message["Subject"] = "Your hospital statement"
    message["From"] = "billing@examplehospital.test"
    message["Message-ID"] = "<bill-1@examplehospital.test>"
    message.set_content("Please see attached.")
    message.add_attachment(
        b"Account Number: ABC12345\nAmount Due: $300.00",
        maintype="text",
        subtype="plain",
        filename="statement.txt",
    )

    ingestor = EmailIngestor(Settings(storage_dir=tmp_path), LocalDocumentStore(Settings(storage_dir=tmp_path)))
    response = ingestor.parse_message_bytes(message.as_bytes())

    assert response.scanned_messages == 1
    assert response.matched_messages == 1
    assert response.results[0].attachments[0].original_filename == "statement.txt"
    assert Path(response.results[0].attachments[0].storage_path).exists()


def test_parse_message_bytes_accepts_docx_attachments_from_allowed_extensions(tmp_path: Path) -> None:
    message = EmailMessage()
    message["Subject"] = "Supporting documents"
    message["From"] = "billing@examplehospital.test"
    message["Message-ID"] = "<bill-2@examplehospital.test>"
    message.set_content("Attached is the dispute packet.")
    message.add_attachment(
        b"fake-docx-payload",
        maintype="application",
        subtype="vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="supporting-record.docx",
    )

    settings = Settings(storage_dir=tmp_path)
    ingestor = EmailIngestor(settings, LocalDocumentStore(settings))
    response = ingestor.parse_message_bytes(message.as_bytes())

    assert response.matched_messages == 1
    assert response.results[0].attachments[0].original_filename == "supporting-record.docx"
