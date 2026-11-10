"""The model must be shown the page, not only tesseract's reading of it.

Why these exist: on 2026-11-10 an audit of the six extractions that had
run in production found every one of them was `text_extraction_method=
image_ocr` with the image discarded before the model call. One phone photo
OCR'd to **zero** characters, and the same PNG uploaded twice OCR'd to 561
characters once and 44 the next time. The model was called with that text
and returned a schema full of nulls -- reported as "it couldn't pick the
characters", when in fact the model never saw the characters.

Each test here fails against that old behaviour.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any, ClassVar
from uuid import uuid4

import pytest

from app.ai.provider import ExtractionProvider
from app.config import Settings
from app.contracts import DocumentType, MedicalBillExtraction
from app.ingestion.documents import collect_page_images
from app.ingestion.pipeline import ExtractionPipeline


def _png(path: Path, size: tuple[int, int] = (400, 300), colour: str = "white") -> Path:
    from PIL import Image

    Image.new("RGB", size, colour).save(path)
    return path


# --- collect_page_images --------------------------------------------------


def test_an_image_becomes_one_jpeg_page(tmp_path: Path) -> None:
    images, warnings = collect_page_images(_png(tmp_path / "bill.png"), Settings())

    assert len(images) == 1
    assert warnings == []
    # JPEG magic. The provider sends it as a data:image/jpeg URI, so this
    # has to actually be a JPEG and not a renamed PNG.
    assert images[0][:2] == b"\xff\xd8"


def test_a_large_photo_is_downscaled_to_the_configured_long_edge(tmp_path: Path) -> None:
    from PIL import Image

    images, _ = collect_page_images(
        _png(tmp_path / "huge.png", size=(4032, 3024)),
        Settings(vision_max_dimension=1600),
    )

    with Image.open(io.BytesIO(images[0])) as decoded:
        assert max(decoded.size) == 1600
        # Aspect ratio preserved, not squashed to a square.
        assert decoded.size == (1600, 1200)


def test_a_png_with_transparency_still_encodes(tmp_path: Path) -> None:
    """RGBA cannot be saved as JPEG. A scan-to-PNG often carries alpha, and
    before the convert() this raised and lost the page silently."""
    from PIL import Image

    path = tmp_path / "alpha.png"
    Image.new("RGBA", (300, 200), (255, 255, 255, 0)).save(path)

    images, warnings = collect_page_images(path, Settings())

    assert len(images) == 1, warnings


def test_a_text_file_has_no_page_images(tmp_path: Path) -> None:
    path = tmp_path / "bill.txt"
    path.write_text("AMOUNT DUE: $145.67", encoding="utf-8")

    assert collect_page_images(path, Settings()) == ([], [])


def test_vision_can_be_turned_off(tmp_path: Path) -> None:
    images, _ = collect_page_images(
        _png(tmp_path / "bill.png"), Settings(enable_vision_extraction=False)
    )
    assert images == []


def test_a_pdf_is_rendered_page_by_page_up_to_the_cap(tmp_path: Path) -> None:
    pytest.importorskip("pypdfium2")
    from PIL import Image

    path = tmp_path / "bill.pdf"
    pages = [Image.new("RGB", (612, 792), "white") for _ in range(6)]
    pages[0].save(path, save_all=True, append_images=pages[1:])

    images, warnings = collect_page_images(path, Settings(vision_max_pages=4))

    assert len(images) == 4
    assert any("first 4 of 6 pages" in warning for warning in warnings)


def test_an_unreadable_file_warns_instead_of_raising(tmp_path: Path) -> None:
    path = tmp_path / "broken.png"
    path.write_bytes(b"this is not a PNG")

    images, warnings = collect_page_images(path, Settings())

    # The OCR/text path is independent and still ran, so losing the page
    # image must never be fatal.
    assert images == []
    assert any("Could not prepare page images" in warning for warning in warnings)


# --- the provider actually sends them ------------------------------------


class _Captured:
    """Records the request an ExtractionProvider would have sent."""

    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []


def _provider_with_capture(monkeypatch: pytest.MonkeyPatch, captured: _Captured) -> ExtractionProvider:
    extraction = MedicalBillExtraction(document_type=DocumentType.hospital_bill)
    extraction.provider.name = "MERCY GENERAL HOSPITAL"
    extraction.account_number = "FROMIMAGE1"
    extraction.patient_responsibility.amount = 145.67
    payload = extraction.model_dump_json()

    class _Message:
        content = payload

    class _Choice:
        message = _Message()

    class _Completions:
        @staticmethod
        def create(**kwargs: Any) -> Any:
            captured.messages = kwargs["messages"]

            class _Response:
                choices: ClassVar[list[Any]] = [_Choice()]

            return _Response()

    class _Chat:
        completions = _Completions()

    class _FakeClient:
        def __init__(self, **_: Any) -> None:
            self.chat = _Chat()

    import openai

    monkeypatch.setattr(openai, "OpenAI", _FakeClient)
    return ExtractionProvider(Settings(openrouter_api_key="test-key"))


def test_the_page_image_is_sent_to_the_model(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = _Captured()
    provider = _provider_with_capture(monkeypatch, captured)

    result = provider.extract_bill("garbled ocr", [b"\xff\xd8fake-jpeg-bytes"])

    assert result.account_number == "FROMIMAGE1"
    content = captured.messages[1]["content"]
    assert isinstance(content, list), "the image was dropped and only text was sent"
    image_parts = [part for part in content if part["type"] == "image_url"]
    assert len(image_parts) == 1
    assert image_parts[0]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_the_model_is_told_the_image_outranks_the_ocr_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Without this the model reproduces tesseract's mistakes verbatim."""
    captured = _Captured()
    provider = _provider_with_capture(monkeypatch, captured)

    provider.extract_bill("ANOUNT DUC $7,842.00", [b"\xff\xd8page"])

    text_part = next(p for p in captured.messages[1]["content"] if p["type"] == "text")
    assert "Where they disagree, the image wins." in text_part["text"]
    # The OCR text is still there to corroborate with.
    assert "ANOUNT DUC $7,842.00" in text_part["text"]


def test_a_text_only_document_sends_a_plain_string_as_before(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A .txt bill's extraction must not shift because vision exists."""
    captured = _Captured()
    provider = _provider_with_capture(monkeypatch, captured)

    provider.extract_bill("AMOUNT DUE: $145.67", [])

    assert captured.messages[1]["content"] == "AMOUNT DUE: $145.67"


def test_nothing_to_read_is_refused_instead_of_billed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The exact production case: OCR returned 0 characters, the model was
    called with "" anyway, and the all-null answer that came back was
    indistinguishable from a blank bill."""
    captured = _Captured()
    provider = _provider_with_capture(monkeypatch, captured)

    with pytest.raises(RuntimeError, match="no page image"):
        provider.extract_bill("", [])

    assert captured.messages == [], "the model was called with nothing to read"


# --- end to end through the pipeline -------------------------------------


def test_a_photo_that_ocrs_to_nothing_still_reaches_the_model(tmp_path: Path) -> None:
    """A blank-white PNG is what a failed phone photo looks like to
    tesseract: no text at all. The page must still be sent."""
    seen: dict[str, Any] = {}

    class FakeProvider:
        is_configured = True
        provider_name = "openrouter"
        model = "test/model"

        def extract_bill(self, text: str, images: Any = ()) -> MedicalBillExtraction:
            seen["text"] = text
            seen["images"] = list(images)
            extraction = MedicalBillExtraction(document_type=DocumentType.hospital_bill)
            extraction.provider.name = "READ FROM THE IMAGE"
            return extraction

    pipeline = ExtractionPipeline(Settings(), FakeProvider())
    response = pipeline.extract_from_file(
        case_id=uuid4(),
        document_id=uuid4(),
        path=_png(tmp_path / "photo.png"),
        use_ai=True,
    )

    assert seen["text"].strip() == "", "this test is only meaningful with empty OCR text"
    assert len(seen["images"]) == 1
    assert response.extraction.provider.name == "READ FROM THE IMAGE"
    assert "vision_pages_sent=1" in response.warnings
    # Honest provenance: not an empty string that reads like a blank page.
    assert "extracted from the page image" in (response.extraction.raw_text_excerpt or "")


def test_the_json_schema_request_shape_is_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    """Images are added to the user turn; the structured-output contract
    that makes the response parseable must survive untouched."""
    captured: dict[str, Any] = {}

    extraction = MedicalBillExtraction(document_type=DocumentType.hospital_bill)
    payload = extraction.model_dump_json()

    class _Completions:
        @staticmethod
        def create(**kwargs: Any) -> Any:
            captured.update(kwargs)

            class _R:
                choices: ClassVar[list[Any]] = [
                    type("C", (), {"message": type("M", (), {"content": payload})()})()
                ]

            return _R()

    class _FakeClient:
        def __init__(self, **_: Any) -> None:
            self.chat = type("Chat", (), {"completions": _Completions()})()

    import openai

    monkeypatch.setattr(openai, "OpenAI", _FakeClient)

    ExtractionProvider(Settings(openrouter_api_key="k")).extract_bill("text", [b"\xff\xd8x"])

    assert captured["response_format"]["type"] == "json_schema"
    assert captured["response_format"]["json_schema"]["name"] == "medical_bill_extraction"
    assert captured["temperature"] == 0
    assert json.loads(payload)  # the fake answer is what the real one looks like
