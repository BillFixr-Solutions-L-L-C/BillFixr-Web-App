"""
Reads the hospital's revised bill and checks it against the agreed settlement.

The revised bill can arrive as email text, as a PDF attachment, or both. Text PDFs are read directly.
Scanned PDFs are read by the vision model. The check runs before the client is asked to pay.
"""

import io
import json
import os
import re
from typing import Any, Dict, Optional

import pypdf

AMOUNT_PATTERN = re.compile(r"\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}")
MIN_TEXT_LAYER_CHARS = 40


async def read_pdf(pdf_bytes: bytes, filename: str = "revised_bill.pdf") -> str:
    """Returns the text of a PDF. Uses its text layer when there is one, otherwise the vision model reads the pages."""
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        text = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    except Exception:
        text = ""
    if len(text) >= MIN_TEXT_LAYER_CHARS:
        return text

    # Scanned PDF: no usable text layer. TESTING keeps tests off the network.
    if os.getenv("TESTING"):
        return text
    try:
        from engine.vision_extractor import VisionExtractor
        extracted = await VisionExtractor().extract_bill_multi([(pdf_bytes, filename)])
        return json.dumps(extracted)
    except Exception as e:
        print(f"Warning: vision model could not read the revised bill PDF ({e}).")
        return text


def check_revised_bill(text: str, settled_amount: float) -> Dict[str, Any]:
    """Checks that the revised bill shows the agreed settlement amount."""
    amounts = {round(float(a.replace(",", "")), 2) for a in AMOUNT_PATTERN.findall(text)}
    settled_found = round(float(settled_amount), 2) in amounts
    return {
        "settled_amount": round(float(settled_amount), 2),
        "settled_amount_found": settled_found,
        "zero_balance_found": 0.0 in amounts,
        "passed": settled_found,
    }


def save_pdf(negotiation_id: str, pdf_bytes: bytes, base_dir: Optional[str] = None) -> str:
    """Stores the revised bill PDF on disk and returns its path."""
    data_dir = os.getenv("ENGINE_DATA_DIR") or os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    folder = base_dir or os.path.join(data_dir, "revised_bills")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{negotiation_id}.pdf")
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return path
