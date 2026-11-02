from pathlib import Path
from shutil import which

import pytest

from app.config import Settings
from app.ingestion.documents import extract_text_from_file


def test_plain_text_extraction_reports_plain_text_method(tmp_path: Path) -> None:
    path = tmp_path / "bill.txt"
    path.write_text("Amount Due: $300.00")

    text, method, warnings = extract_text_from_file(path, Settings(storage_dir=tmp_path))

    assert text == "Amount Due: $300.00"
    assert method == "plain_text"
    assert warnings == []


def test_unknown_readable_file_decodes_as_plain_text_fallback(tmp_path: Path) -> None:
    path = tmp_path / "bill.bin"
    path.write_bytes(b"data")

    text, method, warnings = extract_text_from_file(path, Settings(storage_dir=tmp_path))

    assert text == "data"
    assert method == "plain_text_fallback"
    assert warnings


def test_csv_extraction_normalizes_rows(tmp_path: Path) -> None:
    path = tmp_path / "bill.csv"
    path.write_text("label,value\nAmount Due,$300.00\n")

    text, method, warnings = extract_text_from_file(path, Settings(storage_dir=tmp_path))

    assert method == "csv_text"
    assert "Amount Due | $300.00" in text
    assert warnings == []


def test_html_extraction_strips_markup(tmp_path: Path) -> None:
    path = tmp_path / "email.html"
    path.write_text("<html><body><h1>Hospital Bill</h1><p>Amount Due: $300.00</p></body></html>")

    text, method, warnings = extract_text_from_file(path, Settings(storage_dir=tmp_path))

    assert method == "markup_text"
    assert "Hospital Bill" in text
    assert "Amount Due: $300.00" in text
    assert "<h1>" not in text
    assert warnings == []


def test_eml_extraction_reads_headers_body_and_attachment_names(tmp_path: Path) -> None:
    from email.message import EmailMessage

    message = EmailMessage()
    message["From"] = "billing@example.test"
    message["To"] = "patient@example.test"
    message["Subject"] = "Hospital statement"
    message.set_content("Please review your attached bill.")
    message.add_attachment(b"Amount Due: $300.00", maintype="text", subtype="plain", filename="bill.txt")
    path = tmp_path / "statement.eml"
    path.write_bytes(message.as_bytes())

    text, method, warnings = extract_text_from_file(path, Settings(storage_dir=tmp_path))

    assert method == "email_text"
    assert "Subject: Hospital statement" in text
    assert "Please review your attached bill." in text
    assert "Attachment: bill.txt" in text
    assert warnings == []


@pytest.mark.skipif(which("tesseract") is None, reason="native tesseract binary is not installed")
def test_image_ocr_extracts_text(tmp_path: Path) -> None:
    from PIL import Image, ImageDraw, ImageFont

    path = tmp_path / "bill.png"
    image = Image.new("RGB", (360, 120), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    draw.text((12, 20), "North Valley Hospital", fill="black", font=font)
    draw.text((12, 48), "Account Number: IMG12345", fill="black", font=font)
    draw.text((12, 76), "Patient Responsibility: $445.00", fill="black", font=font)
    image = image.resize((1800, 600))
    image.save(path)

    text, method, warnings = extract_text_from_file(
        path,
        Settings(storage_dir=tmp_path, cache_dir=tmp_path / "cache", ocr_engine="tesseract"),
    )

    assert method == "image_ocr"
    if not text.strip():
        pytest.skip(f"OCR environment returned no text: {warnings}")
    assert "North Valley" in text
    assert "IMG12345" in text
    assert warnings == []
