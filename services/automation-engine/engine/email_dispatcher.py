"""
Email Dispatcher Service for BillFixr.
Transmits dispute letters between advocate, hospital billing, and patient.
Sender / Advocate comes from SMTP_FROM. Hospital recipients are always passed in by the caller.
Supports live delivery through Resend (preferred) or SMTP, and a testing dispatch mode.

Resend is preferred because it reports what became of a letter: the web app
has a Resend webhook, so delivery, bounces and opens for a letter sent here
reach the case it belongs to. SMTP reports nothing back, so a letter sent
that way is invisible to the team from the moment it leaves. SMTP remains as
the fallback when RESEND_API_KEY is unset.
Live dispatch occurs ONLY upon explicit user approval/permission. The patient is never CC'd or
added to the thread.
"""

import os
import smtplib
import logging
import uuid
import re
import time
import httpx
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr, formataddr
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from dotenv import load_dotenv

from engine.config import ADVOCATE_EMAIL

load_dotenv(override=True)
logger = logging.getLogger("billfixr.email")

RESEND_API_BASE = os.getenv("RESEND_API_BASE", "https://api.resend.com").rstrip("/")

class EmailDispatcher:
    def __init__(self):
        self._load_config()

    def _load_config(self):
        load_dotenv(override=True)
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "").strip()
        raw_pw = os.getenv("SMTP_PASSWORD", "").strip()
        self.smtp_password = raw_pw.replace(" ", "")
        self.from_email = os.getenv("SMTP_FROM") or ADVOCATE_EMAIL
        self.resend_api_key = os.getenv("RESEND_API_KEY", "").strip()

    def is_live_resend_configured(self) -> bool:
        # Same guard as SMTP: a test run must never reach a real provider.
        if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("TESTING"):
            return False
        self._load_config()
        return bool(self.resend_api_key)

    def _resend_message_id(self, email_id: str) -> Optional[str]:
        """Reads back the Message-ID Resend assigned to a sent email.

        Resend does not let the caller choose the Message-ID, so the one this
        class generates is not what the hospital will see. The inbound poller
        matches a reply by its In-Reply-To header against the stored value, so
        storing ours would mean never matching a reply. Resend exposes the real
        one on GET /emails/:id, shortly after the send is accepted.

        Returns None rather than a guess when it cannot be read: a wrong
        Message-ID is worse than none, because it would also be sent as the
        In-Reply-To of the next letter and break the thread in the hospital's
        mail client.
        """
        for attempt in range(3):
            try:
                with httpx.Client(timeout=10) as client:
                    res = client.get(
                        f"{RESEND_API_BASE}/emails/{email_id}",
                        headers={"Authorization": f"Bearer {self.resend_api_key}"},
                    )
                if res.status_code == 200:
                    real = (res.json() or {}).get("message_id")
                    if real:
                        return real
            except Exception as exc:
                logger.warning("Could not read the Message-ID for Resend email %s: %s", email_id, exc)
            if attempt < 2:
                time.sleep(1)
        logger.error(
            "Resend accepted email %s but never reported its Message-ID. "
            "Replies to this letter will not be matched to the thread.", email_id
        )
        return None

    def _send_via_resend(
        self,
        sender: str,
        to: str,
        cc: str,
        subject: str,
        html: str,
        text: str,
        in_reply_to: Optional[str],
        references: Optional[str],
        tags: Optional[Dict[str, str]],
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "from": formataddr(("BillFixr Advocate", sender)),
            "to": [to],
            "reply_to": sender,
            "subject": subject,
            "html": html,
            "text": text,
        }
        if cc and cc != to:
            payload["cc"] = [cc]

        # Message-ID is deliberately absent: Resend assigns its own and
        # ignores ours. Threading is carried by these two instead, which is
        # what Resend documents.
        headers = {}
        if in_reply_to:
            headers["In-Reply-To"] = in_reply_to
        if references:
            headers["References"] = references
        if headers:
            payload["headers"] = headers

        # Tags come back on the webhook event, which is how the web app links
        # a delivery or a bounce to the case it belongs to without the engine
        # having to call back into it. Resend restricts tag values to ASCII
        # letters, digits, underscores and dashes.
        if tags:
            clean = [
                {"name": k, "value": re.sub(r"[^A-Za-z0-9_-]", "", str(v))[:256]}
                for k, v in tags.items()
                if v
            ]
            if clean:
                payload["tags"] = clean

        with httpx.Client(timeout=20) as client:
            res = client.post(
                f"{RESEND_API_BASE}/emails",
                headers={
                    "Authorization": f"Bearer {self.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if res.status_code >= 300:
            raise RuntimeError(f"Resend rejected the send ({res.status_code}): {res.text[:300]}")

        email_id = (res.json() or {}).get("id")
        if not email_id:
            raise RuntimeError("Resend accepted the send but returned no id.")

        return {"provider_message_id": email_id, "message_id": self._resend_message_id(email_id)}

    def is_live_smtp_configured(self) -> bool:
        # Never send live emails in automated test environments
        if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("TESTING"):
            return False
        self._load_config()
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    def _render_markdown_blocks_to_html(self, md_text: str) -> str:
        """
        Converts markdown into bulletproof, inline-styled HTML blocks for email clients.
        Handles tables, headers, lists, callout boxes for settlement offers, and paragraphs.
        """
        lines = md_text.replace("\r\n", "\n").split("\n")
        output_blocks = []
        i = 0

        in_settlement_card = False
        settlement_card_content = []

        def flush_settlement_card():
            nonlocal in_settlement_card, settlement_card_content
            if in_settlement_card and settlement_card_content:
                card_html = f"""<div style="background-color: #f0fdf4; border: 2px solid #16a34a; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
  <div style="color: #15803d; font-weight: 800; font-size: 13.5px; margin-bottom: 8px; letter-spacing: 0.04em;">
    ⚖️ PROPOSED BINDING SETTLEMENT AGREEMENT &amp; ZERO-BALANCE TERMS
  </div>
  <div style="color: #1e293b; font-size: 13.5px; line-height: 1.55;">
    {''.join(settlement_card_content)}
  </div>
</div>"""
                output_blocks.append(card_html)
                settlement_card_content = []
                in_settlement_card = False

        while i < len(lines):
            line = lines[i].strip()

            if not line:
                i += 1
                continue

            # Check for Markdown Table
            if line.startswith("|") and line.endswith("|"):
                flush_settlement_card()
                table_lines = []
                while i < len(lines) and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                    table_lines.append(lines[i].strip())
                    i += 1

                rows = []
                for tl in table_lines:
                    if re.match(r"^\|?[\s\-:]+(\|[\s\-:]+)+\|?$", tl):
                        continue
                    cells = [c.strip() for c in tl.split("|")[1:-1]]
                    if cells:
                        rows.append(cells)

                if len(rows) >= 2:
                    header = rows[0]
                    body_rows = rows[1:]

                    th_cols = []
                    for h in header:
                        align = "right" if ("amount" in h.lower() or "cost" in h.lower()) else "left"
                        th_cols.append(f'<th style="padding: 10px 12px; border: 1px solid #cbd5e1; text-align: {align}; color: #166534; font-size: 11.5px; font-weight: 700; text-transform: uppercase;">{h}</th>')
                    th_html = "".join(th_cols)

                    tr_html = []
                    for r_idx, row in enumerate(body_rows):
                        bg = "#ffffff" if r_idx % 2 == 0 else "#f8fafc"
                        tds = []
                        for c_idx, cell in enumerate(row):
                            h_title = header[c_idx].lower() if c_idx < len(header) else ""
                            is_amt_col = any(k in h_title for k in ["amount", "cost", "billed", "demanded", "fee", "balance"])
                            is_pure_amt = bool(re.match(r'^\s*[-+]?[\$€£]\s*[\d,]+(?:\.\d+)?\s*$', cell))
                            if is_amt_col or is_pure_amt:
                                style = "font-weight: 700; color: #dc2626; text-align: right; white-space: nowrap;"
                            else:
                                style = "color: #1e293b; text-align: left;"
                            c_fmt = re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", cell)
                            c_fmt = re.sub(r"\*(.*?)\*", r"<em>\1</em>", c_fmt)
                            tds.append(f'<td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px; line-height: 1.45; {style}">{c_fmt}</td>')
                        tr_html.append(f'<tr style="background-color: {bg};">{"".join(tds)}</tr>')

                    tbl_html = f"""<div style="margin: 18px 0; overflow-x: auto;">
  <table cellpadding="10" cellspacing="0" style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; border: 1px solid #cbd5e1; background-color: #ffffff;">
    <thead>
      <tr style="background-color: #f0fdf4;">{th_html}</tr>
    </thead>
    <tbody>
      {''.join(tr_html)}
    </tbody>
  </table>
</div>"""
                    output_blocks.append(tbl_html)
                continue

            # Check for headings
            m_h = re.match(r"^(#{1,4})\s*(.*)$", line)
            if m_h:
                hashes, h_text = m_h.group(1), m_h.group(2).strip()
                clean_h = re.sub(r"^\*+|\*+$", "", h_text).strip()

                if any(k in clean_h.upper() for k in ["SETTLEMENT OFFER", "BINDING SETTLEMENT", "PROPOSED SETTLEMENT", "AGREED TERMS"]):
                    flush_settlement_card()
                    in_settlement_card = True
                    i += 1
                    continue
                else:
                    flush_settlement_card()

                if len(hashes) == 1:
                    h_elem = f'<h2 style="font-size: 16.5px; font-weight: 800; color: #14532d; margin: 20px 0 8px;">{clean_h}</h2>'
                elif len(hashes) == 2:
                    h_elem = f'<h3 style="font-size: 15px; font-weight: 700; color: #15803d; margin: 18px 0 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">{clean_h}</h3>'
                else:
                    h_elem = f'<h4 style="font-size: 13.5px; font-weight: 700; color: #166534; margin: 16px 0 6px;">{clean_h}</h4>'
                output_blocks.append(h_elem)
                i += 1
                continue

            # Check for ordered list items
            if re.match(r"^\d+\.\s+", line):
                list_items = []
                while i < len(lines) and re.match(r"^\d+\.\s+", lines[i].strip()):
                    l_item = re.sub(r"^\d+\.\s+", "", lines[i].strip())
                    l_item = re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", l_item)
                    l_item = re.sub(r"\*(.*?)\*", r"<em>\1</em>", l_item)
                    list_items.append(f'<li style="margin-bottom: 6px; line-height: 1.55;">{l_item}</li>')
                    i += 1
                ol_html = f'<ol style="margin: 10px 0 14px 22px; padding: 0; font-size: 13px; color: #1e293b;">{"".join(list_items)}</ol>'
                if in_settlement_card:
                    settlement_card_content.append(ol_html)
                else:
                    output_blocks.append(ol_html)
                continue

            # Check for unordered list items
            if re.match(r"^[\*\-]\s+", line):
                list_items = []
                while i < len(lines) and re.match(r"^[\*\-]\s+", lines[i].strip()):
                    l_item = re.sub(r"^[\*\-]\s+", "", lines[i].strip())
                    l_item = re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", l_item)
                    l_item = re.sub(r"\*(.*?)\*", r"<em>\1</em>", l_item)
                    list_items.append(f'<li style="margin-bottom: 6px; line-height: 1.55;">{l_item}</li>')
                    i += 1
                ul_html = f'<ul style="margin: 10px 0 14px 22px; padding: 0; font-size: 13px; color: #1e293b;">{"".join(list_items)}</ul>'
                if in_settlement_card:
                    settlement_card_content.append(ul_html)
                else:
                    output_blocks.append(ul_html)
                continue

            # Paragraph: collect contiguous non-blank lines that are not headings/tables/lists
            p_lines = []
            while i < len(lines):
                cur = lines[i].strip()
                if not cur or cur.startswith("|") or cur.startswith("#") or re.match(r"^\d+\.\s+", cur) or re.match(r"^[\*\-]\s+", cur):
                    break
                p_lines.append(cur)
                i += 1

            if p_lines:
                p_text = " ".join(p_lines)
                p_text = re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", p_text)
                p_text = re.sub(r"\*(.*?)\*", r"<em>\1</em>", p_text)
                p_html = f'<p style="margin: 0 0 12px 0; font-size: 13.5px; line-height: 1.6; color: #27272a;">{p_text}</p>'
                if in_settlement_card:
                    settlement_card_content.append(p_html)
                else:
                    output_blocks.append(p_html)

        flush_settlement_card()
        return "\n".join(output_blocks)

    def build_hospital_email_html(
        self,
        letter_markdown: str,
        tracking_code: str,
        target_sender: str,
        target_hospital: str,
        target_patient: str,
        target_support: str = "",
        include_legal_attachment: bool = False,
        hipaa_authorization_text: str = ""
    ) -> str:
        """
        Builds a high-impact, executive HTML email packet formatted specifically
        for hospital billing dispute committees, provider administration, and CFO review.
        """
        now_str = datetime.now(timezone.utc).strftime("%B %d, %Y")

        pat_m = re.search(r'(?:PATIENT(?:\s*NAME)?|Patient):\*{0,2}\s*([^\n\r,]+)', letter_markdown, re.I)
        patient_name = pat_m.group(1).replace('*', '').strip() if pat_m else "Patient"

        acc_m = re.search(r'(?:ACCOUNT|Account\s*#|INVOICE\s*NUMBER):\*{0,2}\s*#?([0-9A-Za-z-]+)', letter_markdown, re.I)
        account_number = acc_m.group(1).replace('*', '').strip() if acc_m else "N/A"

        fac_m = re.search(r'(?:FACILITY|Provider|Healthcare Provider):\*{0,2}\s*([^\n\r]+)', letter_markdown, re.I)
        facility_name = fac_m.group(1).replace('*', '').strip() if fac_m else "Healthcare Provider"

        # Clean code fences and placeholders
        md = re.sub(r'^```[a-z]*\s*\n?', '', letter_markdown.strip(), flags=re.I)
        md = re.sub(r'\n?```\s*$', '', md, flags=re.I).strip()
        md = re.sub(r'\[Your Address\]', 'Patient Address on File', md, flags=re.I)
        md = re.sub(r'\[City,\s*State,\s*ZIP\]', 'Example City, ST', md, flags=re.I)
        md = re.sub(r'\[Email Address\]', target_sender, md, flags=re.I)
        md = re.sub(r'\[Phone Number\]', '(615) 555-0192', md, flags=re.I)
        md = re.sub(r'\[Provider Address\]', '100 Example Street, Example City, ST 00000', md, flags=re.I)
        md = re.sub(r'\[Date\]', now_str, md, flags=re.I)
        md = re.sub(r'\[Current Date\]', now_str, md, flags=re.I)

        # Extract Subject line if present in top metadata
        subj_m = re.search(r'(?:Subject|### RE|RE):\s*([^\n]+)', md, re.I)
        subject_line = subj_m.group(1).replace('*', '').strip() if subj_m else f"Formal Dispute of Account #{account_number} | Billing Dispute & Settlement Offer"

        # Separate main letter body from top metadata headers
        salutation_m = re.search(r'(Dear\s+[^\n]+|I\s+am\s+writing\s+to\s+formally\s+dispute)', md, re.I)
        body_text = md[salutation_m.start():].strip() if salutation_m else md

        # Cut off redundant trailing signature if present in text, since we render an executive signature block
        sig_m = re.search(r'\n+(?:Sincerely|Respectfully|Respectfully submitted|Best regards),?\s*\n', body_text, re.I)
        if sig_m:
            body_text = body_text[:sig_m.start()].strip()

        # Render letter body into clean HTML blocks
        body_html = self._render_markdown_blocks_to_html(body_text)

        # Executive Signature Block - Signed by BillFixr Patient Financial Advocacy
        signature_html = f'''
        <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <div style="font-size: 13.5px; color: #334155; margin-bottom: 8px;">Respectfully submitted,</div>
          <div style="font-size: 15px; font-weight: 800; color: #14532d; letter-spacing: -0.01em;">BillFixr Patient Financial Advocacy</div>
          <div style="font-size: 12.5px; color: #475569; line-height: 1.5; margin-top: 3px;">
            <strong>Authorized Representative on behalf of:</strong> {patient_name}<br>
            Account #{account_number} &bull; Case Reference: <span style="font-family: monospace; font-weight: 700; color: #0f172a;">{tracking_code}</span><br>
            Advocate Contact: <a href="mailto:{target_sender}" style="color: #166534; text-decoration: none; font-weight: 600;">{target_sender}</a>
          </div>
        </div>
        '''

        # Optional HIPAA block
        hipaa_html = ""
        if include_legal_attachment and hipaa_authorization_text:
            hipaa_html = f'''
            <div style="margin-top: 24px; padding: 16px 20px; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 12px; color: #475569; line-height: 1.5;">
              <strong style="color: #0f172a; font-size: 13px;">LEGAL ATTACHMENT: HIPAA AUTHORIZATION (45 CFR § 164.508)</strong><br><br>
              {hipaa_authorization_text.strip().replace(chr(10), "<br>")}
            </div>
            '''

        return f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Formal Medical Bill Dispute Notice</title>
</head>
<body style="margin: 0; padding: 24px 10px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px; margin: 0 auto; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
    <tr>
      <td style="padding: 28px 32px;">
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom: 2px solid #146138; padding-bottom: 14px; margin-bottom: 18px;">
          <tr>
            <td style="vertical-align: top; width: 60%;">
              <div style="font-size: 22px; font-weight: 800; color: #146138; letter-spacing: -0.02em;">BillFixr</div>
              <div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-top: 2px;">
                Patient Financial Advocacy &bull; Official Dispute Filing
              </div>
              <div style="margin-top: 10px; font-size: 12.5px; color: #334155; line-height: 1.45;">
                <strong>Patient:</strong> {patient_name}<br>
                <strong>Account #:</strong> <span style="font-family: monospace; font-weight: bold;">{account_number}</span><br>
                <strong>Advocate:</strong> {target_sender}
              </div>
            </td>
            <td style="vertical-align: top; text-align: right; width: 40%;">
              <div style="font-size: 12.5px; font-weight: 700; color: #1e293b;">{now_str}</div>
              <div style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; border: 1px solid #fde68a; margin: 6px 0;">
                REF: {tracking_code}
              </div>
              <div style="font-size: 12px; color: #475569; line-height: 1.4; text-align: right;">
                <strong>TO:</strong> Billing Dispute &amp; Resolution Dept<br>
                {facility_name}<br>
                Example City, ST
              </div>
            </td>
          </tr>
        </table>

        <!-- Formal Subject Banner -->
        <div style="background-color: #f0fdf4; border-left: 4px solid #146138; padding: 10px 14px; margin-bottom: 18px; border-radius: 4px; border-top: 1px solid #dcfce7; border-right: 1px solid #dcfce7; border-bottom: 1px solid #dcfce7;">
          <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; color: #146138; letter-spacing: 0.05em; margin-bottom: 2px;">
            Formal Notice of Billing Dispute
          </div>
          <div style="font-size: 13.5px; font-weight: 700; color: #0f172a;">
            RE: {subject_line}
          </div>
        </div>

        <!-- Rendered Letter Body -->
        {body_html}

        <!-- Signature Block -->
        {signature_html}

        {hipaa_html}

        <!-- Footer Notice -->
        <div style="margin-top: 30px; padding: 12px 16px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; line-height: 1.45;">
          <strong>NOTICE:</strong> This account is in dispute. Please pause collection activity and credit reporting while the dispute is reviewed.<br>
          Dispatched securely via <strong>BillFixr Patient Advocacy Engine</strong> &bull; Thread Tracking Ref: {tracking_code}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>'''

    def dispatch_dispute_packet(
        self,
        recipient_email: str,
        subject: str,
        letter_markdown: str,
        hipaa_authorization_text: str = "",
        tracking_code: str = "",
        patient_email: str = "",
        sender_email: str = "",
        support_email: str = "",
        include_legal_attachment: bool = False,
        message_id: Optional[str] = None,
        in_reply_to: Optional[str] = None,
        references: Optional[str] = None,
        tags: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Dispatches dispute letter connecting both hospital contacts (Billing & Support/Advocacy)
        and Patient CC in ONE SHARED CONVERSATION THREAD.
        Preserves conversation thread via RFC 5322 In-Reply-To & References headers.
        Sends as rich multipart/alternative email (HTML + Plain text).
        """
        raw_sender = sender_email.strip() or self.from_email or ADVOCATE_EMAIL
        # Parse clean email address from raw_sender
        _, parsed_addr = parseaddr(raw_sender)
        target_sender = parsed_addr if parsed_addr else raw_sender

        target_hospital = recipient_email.strip()
        if not target_hospital:
            raise ValueError("A hospital billing email is required before a dispute can be sent.")
        target_support = support_email.strip() or target_hospital
        target_patient = ""
        timestamp = datetime.now(timezone.utc).isoformat()

        # Normalize subject threading
        clean_subj = subject.strip()
        if in_reply_to and not clean_subj.lower().startswith("re:"):
            clean_subj = f"Re: {clean_subj}"

        # Ensure RFC 5322 Message-ID
        if not message_id:
            safe_code = re.sub(r'[^a-zA-Z0-9.-]', '', tracking_code) or "dispute"
            seq = uuid.uuid4().hex[:6]
            assigned_message_id = f"<{safe_code}-{seq}@billfixr.com>"
        else:
            assigned_message_id = message_id

        # Build clean plain text version (executive formal layout without raw debug dump)
        now_date_str = datetime.now(timezone.utc).strftime('%B %d, %Y')
        pat_m = re.search(r'(?:PATIENT(?:\s*NAME)?|Patient):\*{0,2}\s*([^\n\r,]+)', letter_markdown, re.I)
        patient_name = pat_m.group(1).replace('*', '').strip() if pat_m else "Patient"
        acc_m = re.search(r'(?:ACCOUNT|Account\s*#|INVOICE\s*NUMBER):\*{0,2}\s*#?([0-9A-Za-z-]+)', letter_markdown, re.I)
        account_number = acc_m.group(1).replace('*', '').strip() if acc_m else "N/A"

        plain_text_parts = [
            "=" * 72,
            "BILLFIXR PATIENT FINANCIAL ADVOCACY | OFFICIAL DISPUTE FILING",
            f"Case Reference: {tracking_code} | Date: {now_date_str}",
            "=" * 72,
            f"TO:         Billing Dispute & Resolution Department",
            f"ADVOCATE:   BillFixr Patient Financial Advocacy ({target_sender})",
            f"ON BEHALF OF: {patient_name} (Patient & Consumer Debtor)",
            f"ACCOUNT #:  {account_number}",
            "=" * 72,
            "",
            letter_markdown.strip(),
            "",
            "=" * 72,
            "NOTICE: This account is in dispute. Please pause collection activity and credit reporting while the dispute is reviewed.",
            f"Dispatched via BillFixr Patient Advocacy Engine | Case Ref: {tracking_code}",
            "=" * 72
        ]

        if include_legal_attachment and hipaa_authorization_text:
            plain_text_parts.extend([
                "",
                "=" * 72,
                "LEGAL ATTACHMENT: HIPAA AUTHORIZATION (45 CFR § 164.508)",
                "=" * 72,
                "",
                hipaa_authorization_text.strip()
            ])

        full_body = "\n".join(plain_text_parts)

        # Build executive rich HTML version for Gmail/Outlook/Apple Mail
        html_email = self.build_hospital_email_html(
            letter_markdown=letter_markdown,
            tracking_code=tracking_code,
            target_sender=target_sender,
            target_hospital=target_hospital,
            target_patient="",
            target_support=target_support,
            include_legal_attachment=include_legal_attachment,
            hipaa_authorization_text=hipaa_authorization_text
        )

        receipt = {
            "sender": target_sender,
            "recipient_hospital": target_hospital,
            "support_email": target_support,
            "patient_cc": None,
            "subject": clean_subj,
            "tracking_code": tracking_code,
            "timestamp": timestamp,
            "legal_attachment_included": include_legal_attachment,
            "message_id": assigned_message_id,
            # Resend's own id for the send, which its webhook quotes as
            # `email_id`. None on every other path — SMTP has no such thing.
            "provider_message_id": None,
            "in_reply_to": in_reply_to,
            "references": references,
            "delivered": True
        }

        if self.is_live_resend_configured():
            try:
                sent = self._send_via_resend(
                    sender=target_sender,
                    to=target_hospital,
                    cc=target_support,
                    subject=clean_subj,
                    html=html_email,
                    text=full_body,
                    in_reply_to=in_reply_to,
                    references=references,
                    tags=tags,
                )
                receipt["provider_message_id"] = sent["provider_message_id"]
                # The Message-ID Resend assigned, not the one generated above.
                # None when it could not be read — see _resend_message_id.
                receipt["message_id"] = sent["message_id"]
                receipt["mode"] = "LIVE_RESEND"
                receipt["status_note"] = f"Delivered to {target_hospital} via Resend"
                logger.info(receipt["status_note"])
                return receipt
            except Exception as e:
                # Falling through to SMTP would send the letter untracked,
                # which is the thing Resend was chosen to fix — but not
                # sending at all is worse, so it falls through and says so.
                logger.error("Resend send failed (%s). Falling back.", e)
                receipt["resend_error"] = str(e)[:300]

        if self.is_live_smtp_configured():
            try:
                # Use multipart/alternative so modern email clients render the executive HTML
                msg = MIMEMultipart("alternative")
                msg["From"] = formataddr(("BillFixr Advocate", target_sender))
                msg["To"] = target_hospital
                if target_support and target_support != target_hospital:
                    msg["Cc"] = target_support
                msg["Reply-To"] = target_sender
                msg["Subject"] = clean_subj
                
                # RFC 5322 Threading Headers
                msg["Message-ID"] = assigned_message_id
                if in_reply_to:
                    msg["In-Reply-To"] = in_reply_to
                if references:
                    msg["References"] = references

                # Plain text version (fallback for non-HTML readers)
                msg.attach(MIMEText(full_body, "plain", "utf-8"))
                # Rich HTML version (renders in Gmail, Apple Mail, Outlook)
                msg.attach(MIMEText(html_email, "html", "utf-8"))

                recipients = [target_hospital]
                if target_support and target_support not in recipients:
                    recipients.append(target_support)
                # The patient is never a recipient: only the hospital contacts passed in are used.
                recipients = [r for r in recipients if r]

                if self.smtp_port == 465:
                    with smtplib.SMTP_SSL(self.smtp_host, 465, timeout=15) as server:
                        server.login(self.smtp_user, self.smtp_password)
                        server.sendmail(target_sender, recipients, msg.as_string())
                else:
                    try:
                        with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=8) as server:
                            server.starttls()
                            server.login(self.smtp_user, self.smtp_password)
                            server.sendmail(target_sender, recipients, msg.as_string())
                    except Exception:
                        # Fallback to SSL on port 465
                        with smtplib.SMTP_SSL(self.smtp_host, 465, timeout=15) as server:
                            server.login(self.smtp_user, self.smtp_password)
                            server.sendmail(target_sender, recipients, msg.as_string())

                receipt["mode"] = "LIVE_SMTP"
                receipt["status_note"] = f"Live threaded email delivered to {target_hospital} via {self.smtp_host}"
                logger.info(receipt["status_note"])
                print("\n" + "=" * 70)
                print(f"🚀 [LIVE THREADED HTML EMAIL DELIVERED VIA GMAIL SMTP!]")
                print(f"FROM:       BillFixr Advocate <{target_sender}>")
                print(f"TO:         {target_hospital}")
                if target_support and target_support != target_hospital:
                    print(f"CC:         {target_support}")
                print(f"SUBJ:       {clean_subj}")
                print(f"MSG-ID:     {assigned_message_id}")
                if in_reply_to:
                    print(f"IN-REPLY-TO:{in_reply_to}")
                if references:
                    print(f"REFERENCES: {references}")
                print("=" * 70 + "\n")
                return receipt
            except Exception as e:
                logger.error(f"Live SMTP failed ({e}). Operating in testing connection mode.")
                receipt["mode"] = "MOCK_TESTING"
                receipt["status_note"] = f"SMTP auth pending ({str(e)}). Connected in testing mode."
                return receipt
        else:
            # Testing mode: connect hospital billing cleanly without patient CC
            receipt["mode"] = "TESTING_CONNECTED"
            receipt["status_note"] = (
                f"Testing Mode: Connected {target_sender} -> {target_hospital}. "
                f"Legal attachment omitted per testing specification."
            )
            print("\n" + "=" * 70)
            print(f"📧 [BILLFIXR DISPUTE DISPATCH - HOSPITAL CONNECTED]")
            print(f"FROM:      {target_sender}")
            print(f"TO:        {target_hospital}")
            if target_support and target_support != target_hospital:
                print(f"CC:        {target_support}")
            print(f"SUBJECT:   {subject}")
            print(f"TRACKING:  {tracking_code}")
            print(f"LEGAL ATT: OMITTED (Testing Mode)")
            print(f"STATUS:    DISPATCHED & LINKED IN DATABASE")
            print("=" * 70 + "\n")
            return receipt

def case_tags(external_ref: Optional[str]) -> Optional[Dict[str, str]]:
    """The tags that let a delivery event find its way back to a case.

    Resend echoes tags on its webhook events, so the web app reads the case
    from the event itself rather than keeping a table of message ids or
    having the engine call back. Nothing is tagged when the caller did not
    give a reference — an untagged letter is untracked, not mislabelled.
    """
    ref = (external_ref or "").strip()
    return {"case_ref": ref} if ref else None


email_dispatcher = EmailDispatcher()
