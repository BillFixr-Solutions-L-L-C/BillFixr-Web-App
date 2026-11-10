import base64
import json
from collections.abc import Sequence
from typing import Any

from app.ai.prompts import MEDICAL_BILL_EXTRACTION_SYSTEM_PROMPT
from app.config import Settings
from app.contracts import MedicalBillExtraction

# What the model is told when it gets both a picture of the page and
# tesseract's reading of it. The ordering matters: OCR on a phone photo is
# frequently wrong or empty, and without this the model treats the garbled
# text as authoritative and reproduces its mistakes.
_VISION_INSTRUCTION = (
    "The attached image(s) are the pages of this document. Read the values off the "
    "image. Any text below is an automatic OCR transcription of the same pages and is "
    "often wrong or incomplete -- use it only to corroborate what you can see. Where "
    "they disagree, the image wins."
)
_OCR_ONLY_HEADER = "OCR transcription of the document:"


class ExtractionProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.provider_name = "openrouter" if settings.openrouter_api_key else "openai"
        self.api_key = settings.openrouter_api_key or settings.openai_api_key
        self.model = (
            settings.openrouter_extraction_model
            if settings.openrouter_api_key
            else settings.openai_extraction_model
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def extract_bill(
        self,
        text: str,
        images: Sequence[bytes] | None = None,
    ) -> MedicalBillExtraction:
        """Extract from the page images, the OCR text, or both.

        `images` is JPEG bytes per page. Passing them is what makes this an
        extractor rather than an OCR post-processor -- see the note on
        Settings.enable_vision_extraction.
        """
        if not self.api_key:
            raise RuntimeError("No AI extraction provider is configured.")

        pages = list(images or [])
        if not pages and not text.strip():
            # Calling the model with an empty string costs money and
            # returns a schema full of nulls that is indistinguishable from
            # "this bill says nothing". Refuse instead, loudly.
            raise RuntimeError(
                "Nothing to extract from: OCR produced no text and no page image was available."
            )

        if self.provider_name == "openrouter":
            return self._extract_with_openrouter(text, pages)

        return self._extract_with_openai(text, pages)

    def _extract_with_openai(self, text: str, images: Sequence[bytes] = ()) -> MedicalBillExtraction:
        from openai import OpenAI

        client = OpenAI(api_key=self.settings.openai_api_key)
        schema = MedicalBillExtraction.model_json_schema()
        response = client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": MEDICAL_BILL_EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": _responses_user_content(text, images)},
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "medical_bill_extraction",
                    "schema": schema,
                    "strict": False,
                }
            },
        )
        payload = _extract_response_text(response)
        return MedicalBillExtraction.model_validate_json(payload)

    def _extract_with_openrouter(
        self,
        text: str,
        images: Sequence[bytes] = (),
    ) -> MedicalBillExtraction:
        from openai import OpenAI

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=self.settings.openrouter_api_key,
            default_headers={
                "HTTP-Referer": "http://127.0.0.1:8000",
                "X-OpenRouter-Title": "BillFixr Local Ingestion Console",
            },
        )
        schema = MedicalBillExtraction.model_json_schema()
        response = client.chat.completions.create(
            model=self.model,
            temperature=0,
            messages=[
                {"role": "system", "content": MEDICAL_BILL_EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": _chat_user_content(text, images)},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "medical_bill_extraction",
                    "strict": False,
                    "schema": schema,
                },
            },
        )
        payload = response.choices[0].message.content or "{}"
        return MedicalBillExtraction.model_validate_json(payload)


def _data_uri(image: bytes) -> str:
    return f"data:image/jpeg;base64,{base64.b64encode(image).decode('ascii')}"


def _prompt_text(text: str, has_images: bool) -> str:
    """The text half of the user turn.

    Kept as a plain string when there are no images so the request is
    byte-for-byte what it was before this change -- a text document's
    extraction should not shift because the vision path exists.
    """
    body = text[:120_000]
    if not has_images:
        return body
    if not body.strip():
        return _VISION_INSTRUCTION
    return f"{_VISION_INSTRUCTION}\n\n{_OCR_ONLY_HEADER}\n{body}"


def _chat_user_content(text: str, images: Sequence[bytes]) -> Any:
    """Chat Completions shape (OpenRouter): content parts with image_url."""
    if not images:
        return _prompt_text(text, has_images=False)
    parts: list[dict[str, Any]] = [
        {"type": "image_url", "image_url": {"url": _data_uri(image)}} for image in images
    ]
    # Text last: the instruction refers back to the images above it.
    parts.append({"type": "text", "text": _prompt_text(text, has_images=True)})
    return parts


def _responses_user_content(text: str, images: Sequence[bytes]) -> Any:
    """Responses API shape (OpenAI direct): input_image instead of image_url."""
    if not images:
        return _prompt_text(text, has_images=False)
    parts: list[dict[str, Any]] = [
        {"type": "input_image", "image_url": _data_uri(image)} for image in images
    ]
    parts.append({"type": "input_text", "text": _prompt_text(text, has_images=True)})
    return parts


def _extract_response_text(response: Any) -> str:
    if getattr(response, "output_text", None):
        return response.output_text

    chunks: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                chunks.append(text)
    if chunks:
        return "".join(chunks)

    return json.dumps({})
