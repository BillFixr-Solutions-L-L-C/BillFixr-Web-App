"""
Builds the demo's revised itemized bill as a PDF, with no third-party packages.

The hospital in this file is fictional. Amounts match the demo case: billed $2,000.50, settled $149.99.

Usage:
    python3 demo_assets/make_revised_bill_pdf.py --tracking BFX-21935-ABC123 --settled 149.99 --out demo_assets/revised_bill.pdf

The settled amount must match the amount the case settled at. BillFixr checks this before asking the client to pay.
"""

import argparse

BILLED = 2000.50
SETTLED = 149.99

LINE_ITEMS = [
    ("Emergency visit", "Emergency department, level 3", "99283", 650.00),
    ("Lab", "Complete blood count", "85025", 95.00),
    ("Radiology", "Ankle X-ray, 3 views", "73610", 420.13),
    ("Facility", "Facility operating fee", "-", 835.37),
]


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _money(value: float) -> str:
    return f"${value:,.2f}"


def build_pdf(tracking: str = "BFX-XXXXX-XXXXXX", account: str = "DEMO-000123",
              billed: float = BILLED, settled: float = SETTLED) -> bytes:
    """Returns a one-page PDF with a text layer, so it can be read with or without a vision model."""
    ops = []

    def text(x, y, size, string, bold=False):
        font = "F2" if bold else "F1"
        ops.append(f"BT /{font} {size} Tf {x} {y} Td ({_escape(string)}) Tj ET")

    def rule(x1, y1, x2, y2, width=0.6):
        ops.append(f"{width} w {x1} {y1} m {x2} {y2} l S")

    text(50, 735, 16, "Riverside Community Health Center", bold=True)
    text(50, 718, 9, "Patient Financial Services")
    text(380, 735, 13, "REVISED ITEMIZED STATEMENT", bold=True)
    rule(50, 705, 562, 705, 1.2)

    text(50, 685, 10, f"Account #: {account}")
    text(50, 670, 10, f"Case reference: {tracking}")
    text(50, 655, 10, "Statement date: October 23, 2026")
    text(330, 685, 10, "Reason: Revised after settlement agreement")

    y = 615
    for x, label in ((50, "Service"), (160, "Description"), (400, "CPT"), (500, "Charge")):
        text(x, y, 10, label, bold=True)
    rule(50, y - 6, 562, y - 6)
    y -= 24
    for service, description, cpt, charge in LINE_ITEMS:
        text(50, y, 10, service)
        text(160, y, 10, description)
        text(400, y, 10, cpt)
        text(500, y, 10, _money(charge))
        y -= 20

    rule(50, y + 8, 562, y + 8)
    y -= 16
    adjustment = round(billed - settled, 2)
    for label, value, bold in (
        ("Total charges", _money(billed), False),
        ("Settlement adjustment", "-" + _money(adjustment), False),
        ("Settled amount", _money(settled), True),
        ("Remaining balance after settlement", _money(0), True),
    ):
        text(280, y, 10, label, bold=bold)
        text(500, y, 10, value, bold=bold)
        y -= 20

    y -= 14
    text(50, y, 9, f"This statement reflects the agreed settlement of {_money(settled)} in full satisfaction of the account.")
    text(50, y - 14, 9, "No further balance is due once the settled amount is received.")

    stream = "\n".join(ops).encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tracking", default="BFX-XXXXX-XXXXXX")
    parser.add_argument("--account", default="DEMO-000123")
    parser.add_argument("--billed", type=float, default=BILLED)
    parser.add_argument("--settled", type=float, default=SETTLED)
    parser.add_argument("--out", default="demo_assets/revised_bill.pdf")
    args = parser.parse_args()
    with open(args.out, "wb") as f:
        f.write(build_pdf(args.tracking, args.account, args.billed, args.settled))
    print(f"Wrote {args.out}")
