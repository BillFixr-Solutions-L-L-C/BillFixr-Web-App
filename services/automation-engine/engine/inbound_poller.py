"""
Inbound Gmail Poller Service for BillFixr.
Connects via IMAP SSL (imap.gmail.com:993) using configured credentials
to fetch real inbound replies from hospital billing departments, parse tracking tokens,
and feed messages into the AI Negotiator.
"""

import os
import re
import imaplib
import email
import asyncio
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

from database import NegotiationRepository
from engine.negotiator import NegotiationService

logger = logging.getLogger("billfixr.inbound")

class InboundEmailPoller:
    def __init__(self):
        self._load_config()
        self.negotiation_service = NegotiationService()
        # Only one sync may run at a time. The background loop and the manual sync button can overlap,
        # and an AI analysis takes seconds, so both would otherwise ingest the same message.
        self._sync_lock = asyncio.Lock()

    def _load_config(self):
        load_dotenv(override=True)
        self.imap_host = os.getenv("IMAP_HOST", "imap.gmail.com")
        self.imap_port = int(os.getenv("IMAP_PORT", "993"))
        self.user = os.getenv("SMTP_USER", "").strip()
        raw_pw = os.getenv("SMTP_PASSWORD", "").strip()
        self.password = raw_pw.replace(" ", "")

    def is_configured(self) -> bool:
        self._load_config()
        # TESTING keeps every inbox check (background loop and the watch) off the live mailbox.
        return bool(self.user and self.password) and not os.getenv("TESTING")

    def _clean_body(self, raw_body: str) -> str:
        """Strips quoted reply threads and email footer signatures."""
        lines = []
        for line in raw_body.splitlines():
            # Stop if we hit Gmail's quoted reply line: On ... wrote:
            if re.match(r"^On\s+.+wrote:$", line.strip(), re.IGNORECASE):
                break
            # Skip standard quoted lines
            if line.strip().startswith(">"):
                continue
            lines.append(line)
        cleaned = "\n".join(lines).strip()
        return cleaned or raw_body.strip()

    def _extract_tracking_code(self, subject: str, body: str) -> Optional[str]:
        # Pattern: BFX-XXXXX-XXXXXX
        match = re.search(r"BFX-[A-Z0-9]{4,10}-[A-Z0-9]{4,10}", subject, re.IGNORECASE)
        if match:
            return match.group(0).upper()
        match = re.search(r"BFX-[A-Z0-9]{4,10}-[A-Z0-9]{4,10}", body, re.IGNORECASE)
        if match:
            return match.group(0).upper()
        return None

    async def sync_inbound_emails(self, max_messages: int = 15) -> List[Dict[str, Any]]:
        """
        Polls Gmail inbox via IMAP SSL and processes matching replies.
        Runs one sync at a time.
        """
        async with self._sync_lock:
            return await self._sync_inbound_emails_locked(max_messages)

    async def _sync_inbound_emails_locked(self, max_messages: int = 15) -> List[Dict[str, Any]]:
        if not self.is_configured():
            logger.warning("IMAP not configured. Skipping sync.")
            return []

        processed = []
        mail = None
        try:
            mail = imaplib.IMAP4_SSL(self.imap_host, self.imap_port, timeout=15)
            mail.login(self.user, self.password)
            mail.select("inbox")

            status, data = mail.search(None, "ALL")
            if status != "OK" or not data[0]:
                return []

            mail_ids = data[0].split()
            # Inspect the latest N messages
            recent_ids = mail_ids[-max_messages:]

            for mid in reversed(recent_ids):
                res, msg_data = mail.fetch(mid, "(RFC822)")
                if res != "OK":
                    continue

                msg = email.message_from_bytes(msg_data[0][1])
                sender = msg.get("From", "")
                subject = msg.get("Subject", "")

                # Skip emails sent by ourselves to avoid loopback
                if self.user.lower() in sender.lower() and not ("re:" in subject.lower()):
                    continue

                # Extract plain text body
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        ctype = part.get_content_type()
                        cdispo = str(part.get("Content-Disposition"))
                        if ctype == "text/plain" and "attachment" not in cdispo:
                            payload = part.get_payload(decode=True)
                            if payload:
                                body = payload.decode("utf-8", errors="ignore")
                            break
                else:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        body = payload.decode("utf-8", errors="ignore")

                # PDF attachments, such as a revised bill sent as a PDF with a short cover email
                attachments = []
                for part in msg.walk():
                    filename = part.get_filename() or ""
                    if part.get_content_type() == "application/pdf" or filename.lower().endswith(".pdf"):
                        pdf_payload = part.get_payload(decode=True)
                        if pdf_payload:
                            attachments.append({"filename": filename or "attachment.pdf", "content": pdf_payload})

                tracking_code = self._extract_tracking_code(subject, body)
                if not tracking_code:
                    continue

                # Extract RFC 5322 threading headers
                inbound_msg_id = (msg.get("Message-ID") or "").strip()
                inbound_in_reply_to = (msg.get("In-Reply-To") or "").strip()
                inbound_references = (msg.get("References") or "").strip()

                # Find associated negotiation
                neg = NegotiationRepository.get_negotiation(tracking_code)
                if not neg:
                    continue

                # Check if this exact text is already in the negotiation timeline
                clean_text = self._clean_body(body)
                already_recorded = any(
                    inbound_msg_id and m.get("message_id_header") == inbound_msg_id for m in neg.get("messages", [])
                )
                for existing_msg in neg.get("messages", []):
                    if existing_msg.get("direction") == "INBOUND":
                        existing_content = existing_msg.get("content_markdown", "")
                        # Simple substring or length comparison to prevent double ingestion
                        # Exact match only. Partial matches wrongly skip replies that share a header block.
                        if clean_text == existing_content.strip():
                            already_recorded = True
                            break

                if already_recorded:
                    continue

                # Process through AI Negotiator (Auto-Pilot will auto-accept if great deal)
                logger.info(f"Ingesting inbound email from {sender} for negotiation {neg['id']} ({tracking_code})")
                print(f"📥 [INGESTED LIVE GMAIL REPLY] From: {sender} | Tracking: {tracking_code} | Msg-ID: {inbound_msg_id}")
                
                result = await self.negotiation_service.analyze_hospital_response(
                    negotiation_id=neg["id"],
                    hospital_message_text=clean_text,
                    sender_email=sender,
                    subject=subject,
                    inbound_message_id=inbound_msg_id,
                    inbound_in_reply_to=inbound_in_reply_to,
                    inbound_references=inbound_references,
                    attachments=attachments
                )

                processed.append({
                    "tracking_code": tracking_code,
                    "negotiation_id": neg["id"],
                    "sender": sender,
                    "subject": subject,
                    "cleaned_body": clean_text,
                    "analysis": result.get("analysis"),
                    "updated_status": result.get("negotiation", {}).get("status")
                })

        except Exception as e:
            logger.error(f"Error during IMAP sync: {e}")
            print(f"Error during IMAP sync: {e}")
        finally:
            if mail:
                try:
                    mail.logout()
                except Exception:
                    pass

        return processed

inbound_poller = InboundEmailPoller()
