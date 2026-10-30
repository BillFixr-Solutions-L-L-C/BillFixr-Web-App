"""
Multimodal Vision Extraction for BillFixr using OpenRouter and Qwen 2.5 VL 72B.
Extracts structured medical bill metadata, CPT/HCPCS codes, revenue codes,
and line-item amounts from images and PDF documents.
"""

import os
import json
import base64
import io
import re
from typing import Dict, Any, Optional
import httpx
from dotenv import load_dotenv
from PIL import Image
import pypdf

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
VISION_MODEL = os.getenv("VISION_MODEL", "google/gemini-2.5-flash")
FALLBACK_VISION_MODEL = "qwen/qwen2.5-vl-72b-instruct"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

EXTRACTION_SYSTEM_PROMPT = """You are an expert US Medical Billing Auditor and Multimodal Document AI.
Your job is to examine images or documents of hospital, clinic, or physician medical bills and extract complete, structured data with maximum accuracy.

Always extract:
1. Provider Details: Provider/Hospital/Clinic name, address, billing phone, and billing email or dispute address.
2. Patient & Statement Details: Patient name, account or invoice number, statement date, date(s) of service.
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
            load_dotenv(override=True)
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
            "temperature": 0.1,
            "max_tokens": 8000
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                if resp.status_code != 200:
                    # Fallback to secondary vision model
                    payload["model"] = FALLBACK_VISION_MODEL
                    resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            except Exception:
                payload["model"] = FALLBACK_VISION_MODEL
                resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)

            if resp.status_code != 200:
                raise RuntimeError(f"OpenRouter API error (HTTP {resp.status_code}): {resp.text}")

            result = resp.json()
            raw_content = result["choices"][0]["message"]["content"]

        # Robust JSON extraction from model output
        cleaned = raw_content.strip()
        # Strip ```json or ``` from start if present
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:].strip()
        
        # Strip trailing ``` if present
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        # If still not starting with {, search for first { and last }
        if not cleaned.startswith("{") and "{" in cleaned:
            first_brace = cleaned.find("{")
            last_brace = cleaned.rfind("}")
            if last_brace > first_brace:
                cleaned = cleaned[first_brace:last_brace + 1]

        # In case the JSON was cut off mid-line_item, try auto-closing it
        try:
            parsed_data = json.loads(cleaned)
        except json.JSONDecodeError:
            # Attempt repair for truncated arrays
            last_brace = cleaned.rfind("}")
            if last_brace != -1:
                attempt = cleaned[:last_brace + 1]
                # If unclosed line_items array, try closing
                if attempt.count("[") > attempt.count("]"):
                    attempt += "\n  ]\n}"
                elif attempt.count("{") > attempt.count("}"):
                    attempt += "\n}"
                try:
                    parsed_data = json.loads(attempt)
                except Exception:
                    # Try finding the largest valid JSON substring
                    match = re.search(r"(\{[\s\S]*\})", cleaned)
                    if match:
                        parsed_data = json.loads(match.group(1))
                    else:
                        raise ValueError(f"Failed to parse structured JSON from vision response: {raw_content[:500]}")
            else:
                raise ValueError(f"Failed to parse structured JSON from vision response: {raw_content[:500]}")

        if not parsed_data.get("id"):
            parsed_data["id"] = f"bill-real-{len(files_data)}p"
        return parsed_data
