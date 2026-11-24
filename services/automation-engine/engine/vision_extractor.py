"""
Multimodal Vision Extraction for BillFixr using OpenRouter and Qwen 2.5 VL 72B.
Extracts structured medical bill metadata, CPT/HCPCS codes, revenue codes,
and line-item amounts from images and PDF documents.
"""

import asyncio
import os
import json
import base64
import io
import re
from typing import Dict, Any, Optional
import httpx
from engine.env import load_service_env
from PIL import Image
import pypdf

load_service_env()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
VISION_MODEL = os.getenv("VISION_MODEL", "google/gemini-2.5-flash")
FALLBACK_VISION_MODEL = "qwen/qwen2.5-vl-72b-instruct"
# A multi-page bill at 8000 output tokens does not fit in the 45s this used
# to allow; the web app already waits up to 240s for the whole call.
# A fixed seed, so the same document asked the same question gets the same
# answer from a provider that supports it. Overridable only to reproduce an
# old reading against a changed prompt.
EXTRACTION_SEED = int(os.getenv("ENGINE_EXTRACTION_SEED", "20261124"))

VISION_TIMEOUT_SECONDS = float(os.getenv("VISION_TIMEOUT_SECONDS", "90"))
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

EXTRACTION_SYSTEM_PROMPT = """You are an expert US Medical Billing Auditor and Multimodal Document AI.
Your job is to examine images or documents of hospital, clinic, or physician medical bills and extract complete, structured data with maximum accuracy.

Always extract:
1. Provider Details: Provider/Hospital/Clinic name, address, billing phone, and billing email or dispute address.
2. Patient & Statement Details: Patient name, the patient's or guarantor's mailing address as printed on the statement, account or invoice number, statement date, date(s) of service.
3. Classification: Determine whether the bill is an 'itemized bill' (contains line-by-line procedures and individual amounts) or a 'summary bill' (only aggregated departmental sums like 'Lab: $500').
4. Financials: Total billed charge, insurance adjustments/payments, and final patient balance due.
5. Itemized Line Items: For every line item, extract:
   - line_id (e.g. L1, L2)
   - date (Date of service)
   - cpt_code (5-digit CPT or HCPCS code if present, else empty string)
   - revenue_code (3 or 4-digit revenue code if present, e.g. 0250, 0450)
   - description (Exact description of procedure, test, drug, or supply)
   - quantity (Number of units, default 1)
   - charge_amount (Billed dollar amount as a float)
   - category (e.g., Pharmacy, Emergency, Radiology, Laboratory, Surgery, Facility Fee, Supplies)

Respond ONLY with a valid JSON object matching this structure:
{
  "provider_name": "string",
  "provider_address": "string",
  "provider_phone": "string",
  "provider_email": "string",
  "patient_name": "string",
  "patient_address": "string",
  "account_number": "string",
  "statement_date": "YYYY-MM-DD",
  "date_of_service": "YYYY-MM-DD",
  "is_itemized": true,
  "total_billed": 0.0,
  "insurance_paid": 0.0,
  "patient_due": 0.0,
  "notes": "Brief summary of clinical encounter or notable charges",
  "line_items": [
    {
      "line_id": "L1",
      "date": "YYYY-MM-DD",
      "cpt_code": "99285",
      "revenue_code": "0450",
      "description": "Emergency Dept Visit Level 5",
      "quantity": 1,
      "charge_amount": 2500.0,
      "category": "Emergency Room"
    }
  ]
}
Do not include any introductory or concluding text outside the JSON block.
"""

class VisionExtractor:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or OPENROUTER_API_KEY
        if not self.api_key:
            # Re-read from .env if needed
            load_service_env(override=True)
            self.api_key = os.getenv("OPENROUTER_API_KEY", "")

    def process_file_to_images(self, file_bytes: bytes, filename: str) -> list[str]:
        """
        Converts uploaded file (image or PDF) into base64 image data URLs.
        """
        fn_lower = filename.lower()
        b64_images = []

        if fn_lower.endswith(".pdf"):
            # Try reading PDF pages. If text layer exists, we can extract text or convert page images
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            # Extract images embedded in first 3 pages
            for page_idx, page in enumerate(reader.pages[:3]):
                images = page.images
                if images:
                    for img in images:
                        b64 = base64.b64encode(img.data).decode("utf-8")
                        mime = "image/png" if img.name.endswith(".png") else "image/jpeg"
                        b64_images.append(f"data:{mime};base64,{b64}")
                        break
            
            # If no embedded images found, check if plain text is extractable
            if not b64_images:
                full_text = "\n".join([page.extract_text() or "" for page in reader.pages[:3]])
                return [("text", full_text)]
        else:
            # Direct image file (PNG, JPG, WebP)
            # Normalize with PIL to ensure valid JPEG/PNG format and reasonable dimensions
            img = Image.open(io.BytesIO(file_bytes))
            if img.mode != "RGB":
                img = img.convert("RGB")
            
            # Resize if overly massive (>2048px on longest side) to optimize latency & tokens
            max_dim = 2048
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim))

            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            b64_images.append(f"data:image/jpeg;base64,{b64}")

        return b64_images

    def process_multiple_files(self, files_data: list[tuple[bytes, str]]) -> list[str]:
        """
        Converts multiple uploaded files (images or PDFs) into a combined list of base64 image data URLs.
        """
        all_images = []
        for file_bytes, filename in files_data:
            imgs = self.process_file_to_images(file_bytes, filename)
            all_images.extend(imgs)
        return all_images

    async def extract_bill(self, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        """
        Convenience method for a single uploaded file.
        """
        return await self.extract_bill_multi([(file_bytes, filename)])

    async def read_document_text(self, files_data: list[tuple[bytes, str]]) -> str:
        """
        Transcribes an arbitrary document to plain text.

        This exists for a hospital's *reply* -- a letter, a determination, a
        faxed page -- which is not a bill and must not be forced through the
        bill schema. The caller gets the words and decides what they mean.

        Until 2026-11-10 /api/negotiations/{id}/reply/upload read the
        uploaded file into a variable and then discarded it, substituting the
        fixed string "[OCR Extracted from <name>]: Scanned written response
        from hospital billing office." Everything downstream keyword-matched
        that sentence, so every paper reply was categorised identically
        whatever it actually said.

        Returns "" when there is nothing to read. The caller must treat that
        as "could not read it" and never as "the hospital said nothing".
        """
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is not configured in .env")

        processed = self.process_multiple_files(files_data)
        if not processed:
            return ""

        # A PDF with a text layer comes back as [("text", ...)] already
        # transcribed -- exact, free, and better than asking a model to read
        # a picture of it.
        if len(processed) == 1 and isinstance(processed[0], tuple) and processed[0][0] == "text":
            return (processed[0][1] or "").strip()

        user_content: list[Dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    f"This is a {len(processed)}-page letter or document from a hospital billing "
                    "department. Transcribe every word of it to plain text, in reading order, "
                    "including any amounts, dates, account numbers and reference codes exactly as "
                    "printed. Do not summarise, interpret, correct or add anything. If a passage "
                    "is illegible write [illegible]. Output the transcription only."
                ),
            }
        ]
        for img in processed:
            if isinstance(img, str) and img.startswith("data:image"):
                user_content.append({"type": "image_url", "image_url": {"url": img}})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://billfixr.com",
            "X-Title": "BillFixr AI Negotiator",
        }
        payload = {
            "model": VISION_MODEL,
            "messages": [{"role": "user", "content": user_content}],
            # A transcription, so no room for invention.
            "temperature": 0,
            "max_tokens": 4000,
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                if resp.status_code != 200:
                    payload["model"] = FALLBACK_VISION_MODEL
                    resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            except Exception:
                payload["model"] = FALLBACK_VISION_MODEL
                resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)

            if resp.status_code != 200:
                raise RuntimeError(
                    f"OpenRouter API error (HTTP {resp.status_code}): {resp.text}"
                )
            result = resp.json()

        return (result["choices"][0]["message"]["content"] or "").strip()

    @staticmethod
    def _parse_model_json(raw_content: str) -> Dict[str, Any]:
        """Pull a JSON object out of a model reply, repairing a truncated one."""
        cleaned = (raw_content or "").strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        if not cleaned.startswith("{") and "{" in cleaned:
            first_brace = cleaned.find("{")
            last_brace = cleaned.rfind("}")
            if last_brace > first_brace:
                cleaned = cleaned[first_brace:last_brace + 1]

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            last_brace = cleaned.rfind("}")
            if last_brace == -1:
                raise ValueError(f"Failed to parse structured JSON from vision response: {raw_content[:300]}")
            attempt = cleaned[:last_brace + 1]
            # The reply was cut off mid line-item: close what is open.
            if attempt.count("[") > attempt.count("]"):
                attempt += "\n  ]\n}"
            elif attempt.count("{") > attempt.count("}"):
                attempt += "\n}"
            try:
                parsed = json.loads(attempt)
            except Exception:
                match = re.search(r"(\{[\s\S]*\})", cleaned)
                if not match:
                    raise ValueError(f"Failed to parse structured JSON from vision response: {raw_content[:300]}")
                parsed = json.loads(match.group(1))
        if not isinstance(parsed, dict):
            raise ValueError("the vision reply was not a JSON object")
        return parsed

    @staticmethod
    def _looks_like_a_bill(data: Dict[str, Any]) -> bool:
        """True when the reading carries something to audit.

        An empty object, or a reply with neither line items nor any total, is
        the model giving up politely. Auditing it would score a $0 bill and
        report it clean, which is the failure the audit's own guard exists for.
        """
        items = data.get("line_items")
        has_items = isinstance(items, list) and len(items) > 0
        has_total = any(
            isinstance(data.get(k), (int, float)) and data.get(k) > 0
            for k in ("total_billed", "patient_due", "total_charges")
        )
        return has_items or has_total

    async def extract_bill_multi(self, files_data: list[tuple[bytes, str]]) -> Dict[str, Any]:
        """
        Extracts structured medical bill metadata using multimodal AI (Gemini 2.5 Flash / Qwen 2.5 VL).
        """
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is not configured in .env")

        processed = self.process_multiple_files(files_data)
        if not processed:
            raise ValueError("Could not extract readable images or content from uploaded file(s).")

        messages = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT}
        ]

        # Check if first is text fallback
        if len(processed) == 1 and isinstance(processed[0], tuple) and processed[0][0] == "text":
            pdf_text = processed[0][1]
            messages.append({
                "role": "user",
                "content": f"Extract all medical bill data from this document text into the required JSON schema:\n\n{pdf_text}"
            })
        else:
            # Build multimodal prompt with all image pages
            user_content = [
                {
                    "type": "text",
                    "text": f"This medical bill contains {len(processed)} page(s). Carefully parse ALL pages. Extract all provider info, patient info, and every individual line item with CPT codes, descriptions, quantities, and charge amounts across all pages into the requested JSON schema."
                }
            ]
            for img in processed:
                if isinstance(img, str) and img.startswith("data:image"):
                    user_content.append({
                        "type": "image_url",
                        "image_url": {"url": img}
                    })
            
            messages.append({
                "role": "user",
                "content": user_content
            })

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://billfixr.com",
            "X-Title": "BillFixr AI Negotiator"
        }

        payload = {
            "model": VISION_MODEL,
            "messages": messages,
            # Zero, not 0.1. This is a transcription of a document, so
            # there is nothing here worth sampling for. At 0.1 the same
            # bill read twice produced two different sets of line items,
            # and because the audit is pure rules over those items, two
            # different sets of findings followed -- reported from a real
            # run where one upload found a duplicate 96127 and the other
            # found two global-surgery overlaps on the same document.
            "temperature": 0,
            # Same request, same reading, where the provider honours it.
            # Not every one does, so this narrows the variance rather than
            # removing it.
            "seed": EXTRACTION_SEED,
            "max_tokens": 8000
        }

        # A reading is only as reliable as the weakest link, and the weak link
        # here is a model that sometimes answers HTTP 200 with something that
        # is not a bill: truncated JSON, prose, or an empty object. The old
        # code retried only on a transport error or a non-200 status, so those
        # 200s surfaced as a failed scan for a customer who had already paid.
        # Each model is tried in turn, and the primary gets a second go after
        # the fallback, before giving up.
        models = [VISION_MODEL, FALLBACK_VISION_MODEL, VISION_MODEL]
        last_error: Exception = RuntimeError("no vision model was tried")
        parsed_data = None
        async with httpx.AsyncClient(timeout=VISION_TIMEOUT_SECONDS) as client:
            for attempt, model in enumerate(models):
                payload["model"] = model
                try:
                    resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                    if resp.status_code != 200:
                        raise RuntimeError(f"OpenRouter API error (HTTP {resp.status_code}): {resp.text[:300]}")
                    raw_content = resp.json()["choices"][0]["message"]["content"]
                    candidate = self._parse_model_json(raw_content)
                    if not self._looks_like_a_bill(candidate):
                        raise ValueError("the reading contained no charges and no total")
                    parsed_data = candidate
                    # Which model actually produced this reading. Two
                    # readings of one document can still differ when the
                    # primary fails its sanity check and a different model
                    # answers instead, and that is worth being able to see
                    # rather than guess at.
                    parsed_data["read_by_model"] = model
                    break
                except Exception as err:  # noqa: BLE001 -- try the next model
                    last_error = err
                    if attempt < len(models) - 1:
                        await asyncio.sleep(min(2.0 * (attempt + 1), 5.0))
        if parsed_data is None:
            raise RuntimeError(f"The bill could not be read after {len(models)} attempts: {last_error}")

        if not parsed_data.get("id"):
            parsed_data["id"] = f"bill-real-{len(files_data)}p"
        return parsed_data
