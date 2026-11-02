import json
from typing import Any

from app.ai.prompts import MEDICAL_BILL_EXTRACTION_SYSTEM_PROMPT
from app.config import Settings
from app.contracts import MedicalBillExtraction


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

    def extract_bill(self, text: str) -> MedicalBillExtraction:
        if not self.api_key:
            raise RuntimeError("No AI extraction provider is configured.")

        if self.provider_name == "openrouter":
            return self._extract_with_openrouter(text)

        return self._extract_with_openai(text)

    def _extract_with_openai(self, text: str) -> MedicalBillExtraction:
        from openai import OpenAI

        client = OpenAI(api_key=self.settings.openai_api_key)
        schema = MedicalBillExtraction.model_json_schema()
        response = client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": MEDICAL_BILL_EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": text[:120_000]},
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

    def _extract_with_openrouter(self, text: str) -> MedicalBillExtraction:
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
                {"role": "user", "content": text[:120_000]},
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
