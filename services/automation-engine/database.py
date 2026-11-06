"""
Database Layer for BillFixr Negotiations.
Persists negotiation sessions, audit records, hospital messages, and timeline events.

Two backends, one dialect:

    ENGINE_DATABASE_URL set    -> PostgreSQL via psycopg 3. Production.
    ENGINE_DATABASE_URL unset  -> SQLite at ENGINE_DB_PATH. Local dev, tests.

Postgres exists because this service's filesystem is not durable. A Render
free web service cannot have a disk at all, so ENGINE_DB_PATH is wiped on
every deploy and every spin-down. When that happens a hospital's reply
still arrives and engine/inbound_poller.py still parses its BFX- tracking
code, but get_negotiation finds nothing, the poller skips the message, and
the reply is dropped with no error anywhere. The negotiation row is the
only record that a letter was ever sent, so it has to outlive the
container.

Every statement below is written once, in SQLite's dialect with "?"
placeholders, and translated for Postgres by the wrappers in this module.
Do not write backend-specific SQL in the repository methods: the test suite
runs against both backends (see tests/conftest.py and the CI matrix), so
anything that only works on one of them fails there.
"""

import sqlite3
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DATABASE_URL = os.getenv("ENGINE_DATABASE_URL", "").strip()
POSTGRES = bool(DATABASE_URL)
# Only consulted on SQLite. Kept as the fallback so a checkout with no
# environment at all still runs.
DB_PATH = os.getenv("ENGINE_DB_PATH") or os.path.join(os.path.dirname(__file__), "billfixrr.db")

if POSTGRES:
    import psycopg
    from psycopg.rows import dict_row


def _translate(sql: str) -> str:
    """Rewrites SQLite's ? placeholders as psycopg's %s.

    Refuses outright on a literal % rather than mangling it. psycopg reads
    % as the start of a placeholder whenever parameters are passed, so a
    LIKE pattern inlined into a statement here would fail at runtime on
    Postgres only -- pass it as a parameter instead.
    """
    if "%" in sql:
        raise ValueError("engine SQL must not contain a literal '%'; pass it as a parameter")
    return sql.replace("?", "%s")


def _ddl(sql: str) -> str:
    """Adjusts column types that do not mean the same thing in both backends.

    SQLite's REAL is a 64-bit float; Postgres's REAL is 32-bit, which is
    about seven significant digits -- enough to shift a five-figure bill by
    a cent. Every REAL here holds money, so Postgres gets the wide type.
    """
    if not POSTGRES:
        return sql
    return re.sub(r"\bREAL\b", "DOUBLE PRECISION", sql)


class _PgCursor:
    """The slice of the sqlite3 cursor API this module and server.py use."""

    def __init__(self, inner):
        self._inner = inner

    def execute(self, sql, params=()):
        self._inner.execute(_translate(sql), tuple(params))
        return self

    def fetchone(self):
        return self._inner.fetchone()

    def fetchall(self):
        return self._inner.fetchall()


class _PgConnection:
    """Same, for the connection. dict_row makes rows behave like sqlite3.Row."""

    def __init__(self, inner):
        self._inner = inner

    def cursor(self):
        return _PgCursor(self._inner.cursor())

    def commit(self):
        self._inner.commit()

    def close(self):
        self._inner.close()


def get_connection():
    if POSTGRES:
        return _PgConnection(psycopg.connect(DATABASE_URL, row_factory=dict_row))
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _add_column(cursor, table: str, name: str, col_def: str) -> None:
    """Adds a column if it is missing, without aborting the transaction.

    On Postgres a failed statement poisons the whole transaction, so the
    try/except-and-carry-on that works on SQLite would take out every
    migration after the first already-present column.
    """
    col_def = _ddl(col_def)
    if POSTGRES:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {col_def}")
        return
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {name} {col_def}")
    except sqlite3.OperationalError:
        pass

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    if POSTGRES:
        # Render overlaps the old and new instance during a deploy, and both
        # run this on import. Concurrent CREATE TABLE IF NOT EXISTS, and
        # concurrent ADD COLUMN IF NOT EXISTS, are both known Postgres races
        # that raise a duplicate-object error and would crash the booting
        # instance; the lock serialises them instead. Session-scoped, not
        # transaction-scoped, because init_db commits part-way through and a
        # transaction lock would be released before the migrations run. It
        # is freed when this connection closes at the end of init_db.
        cursor.execute("SELECT pg_advisory_lock(4116983205)")

    # Table: negotiations
    cursor.execute(_ddl("""
    CREATE TABLE IF NOT EXISTS negotiations (
        id TEXT PRIMARY KEY,
        tracking_code TEXT UNIQUE NOT NULL,
        provider_name TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        total_billed REAL NOT NULL,
        original_balance_due REAL NOT NULL,
        current_demanded_balance REAL NOT NULL,
        current_offer REAL NOT NULL,
        status TEXT NOT NULL,
        hospital_email TEXT,
        patient_email TEXT,
        audit_summary_json TEXT,
        hipaa_authorization_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """))

    # Table: negotiation_messages (timeline of outbound & inbound events)
    cursor.execute(_ddl("""
    CREATE TABLE IF NOT EXISTS negotiation_messages (
        id TEXT PRIMARY KEY,
        negotiation_id TEXT NOT NULL,
        direction TEXT NOT NULL, -- 'OUTBOUND' or 'INBOUND'
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        content_markdown TEXT NOT NULL,
        analysis_json TEXT, -- AI classification, sentiment, extracted counter-offer
        proposed_action_json TEXT, -- AI recommended next counter or step
        status TEXT NOT NULL, -- 'DRAFT', 'SENT', 'RECEIVED', 'APPROVED', 'SUPERSEDED'
        created_at TEXT NOT NULL,
        FOREIGN KEY (negotiation_id) REFERENCES negotiations (id)
    )
    """))

    conn.commit()

    # Dynamic migrations for email threading and autopilot
    migration_cols_negotiations = [
        ("root_message_id", "TEXT"),
        ("last_message_id", "TEXT"),
        ("auto_pilot_enabled", "INTEGER DEFAULT 1"),
        ("payment_instructions_json", "TEXT"),
        ("support_email", "TEXT"),
        ("rescan_count", "INTEGER DEFAULT 0"),
        ("rescan_history_json", "TEXT"),
        ("admin_rerun_count", "INTEGER DEFAULT 0"),
        ("admin_rerun_history_json", "TEXT"),
        ("edit_history_json", "TEXT"),
        ("cadence_step", "INTEGER DEFAULT 0"),
        ("cadence_status", "TEXT DEFAULT 'IDLE'"),
        ("no_response_notice_draft", "TEXT"),
        ("closure_approved_by_admin", "INTEGER DEFAULT 0"),
        ("closed_reason", "TEXT"),
        ("admin_notes", "TEXT"),
        ("original_bill_breakdown_json", "TEXT"),
        # Payments and the revised bill (see engine/payments.py)
        ("commitment_paid", "INTEGER DEFAULT 0"),
        ("settled_amount", "REAL"),
        ("completion_fee", "REAL"),
        ("completion_paid", "INTEGER DEFAULT 0"),
        ("completion_paid_at", "TEXT"),
        ("revised_bill_markdown", "TEXT"),
        ("revised_bill_received_at", "TEXT"),
        ("revised_bill_pdf_path", "TEXT"),
        ("revised_bill_check_json", "TEXT"),
        # Payment references from the web app's payment provider, and its fee rate for this case
        ("commitment_payment_ref", "TEXT"),
        ("completion_payment_ref", "TEXT"),
        ("completion_fee_rate", "REAL"),
        # The web app's case id. Tagged onto every letter sent through
        # Resend so its webhook can match a delivery, bounce or open back
        # to the case without the engine calling into the web app.
        ("external_ref", "TEXT"),
        # The figure autopilot was about to accept when AUTOPILOT_HOLD_FOR_REVIEW
        # stopped it. Before these columns existed the hold wrote
        # status=HELD_FOR_REVIEW and nothing else, so the amount the hospital
        # had agreed to was lost -- the settlement could not be completed
        # afterwards even by hand, because nothing recorded what it was for.
        ("pending_settlement_amount", "REAL"),
        ("held_for_review_at", "TEXT"),
        ("held_for_review_reason", "TEXT"),
    ]
    for col_name, col_def in migration_cols_negotiations:
        _add_column(cursor, "negotiations", col_name, col_def)

    migration_cols_messages = [
        ("message_id_header", "TEXT"),
        ("in_reply_to_header", "TEXT"),
        ("references_header", "TEXT")
    ]
    for col_name, col_def in migration_cols_messages:
        _add_column(cursor, "negotiation_messages", col_name, col_def)

    conn.commit()
    conn.close()

# Initialize DB on module import
init_db()

class NegotiationRepository:
    @staticmethod
    def update_fields(negotiation_id: str, **fields):
        """Sets the given negotiation columns. Keys are internal column names, never user input."""
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        assignments = ", ".join(f"{name} = ?" for name in fields)
        cursor.execute(
            f"UPDATE negotiations SET {assignments}, updated_at = ? WHERE id = ? OR tracking_code = ?",
            (*fields.values(), now, negotiation_id, negotiation_id)
        )
        conn.commit()
        conn.close()

    @staticmethod
    def get_revised_bill_pdf_path(negotiation_id: str) -> Optional[str]:
        """Reads the stored PDF path directly, bypassing the paywall check in get_negotiation."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT revised_bill_pdf_path FROM negotiations WHERE id = ? OR tracking_code = ?", (negotiation_id, negotiation_id))
        row = cursor.fetchone()
        conn.close()
        return row["revised_bill_pdf_path"] if row else None

    @staticmethod
    def get_revised_bill(negotiation_id: str) -> Optional[str]:
        """Reads the revised bill directly, bypassing the paywall check in get_negotiation."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT revised_bill_markdown FROM negotiations WHERE id = ? OR tracking_code = ?", (negotiation_id, negotiation_id))
        row = cursor.fetchone()
        conn.close()
        return row["revised_bill_markdown"] if row else None

    @staticmethod
    def create_negotiation(
        provider_name: str,
        patient_name: str,
        account_number: str,
        total_billed: float,
        patient_due: float,
        initial_offer: float,
        audit_result: Dict[str, Any],
        initial_letter: str,
        hipaa_auth_text: str,
        hospital_email: str = "",
        patient_email: str = "",
        auto_pilot_enabled: bool = True,
        external_ref: str = ""
    ) -> Dict[str, Any]:
        neg_id = str(uuid.uuid4())
        short_id = neg_id[:6].upper()
        # Clean tracking code: e.g. BFX-85273-A1B2
        clean_acc = "".join(c for c in account_number if c.isalnum())[-5:] or "BILL"
        tracking_code = f"BFX-{clean_acc}-{short_id}"
        now = datetime.now(timezone.utc).isoformat()
        
        # Root RFC 5322 Message-ID
        root_msg_id = f"<{tracking_code}-0@billfixr.com>"

        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
        INSERT INTO negotiations (
            id, tracking_code, provider_name, patient_name, account_number,
            total_billed, original_balance_due, current_demanded_balance,
            current_offer, status, hospital_email, patient_email,
            audit_summary_json, hipaa_authorization_text, created_at, updated_at,
            root_message_id, last_message_id, auto_pilot_enabled, external_ref
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            neg_id, tracking_code, provider_name, patient_name, account_number,
            total_billed, patient_due, patient_due,
            initial_offer, "DISPATCHED", hospital_email, patient_email,
            json.dumps(audit_result), hipaa_auth_text, now, now,
            root_msg_id, root_msg_id, 1 if auto_pilot_enabled else 0, external_ref or None
        ))

        # Add initial outbound dispute letter message
        msg_id = str(uuid.uuid4())
        cursor.execute("""
        INSERT INTO negotiation_messages (
            id, negotiation_id, direction, sender, recipient, subject,
            content_markdown, analysis_json, proposed_action_json, status, created_at,
            message_id_header, in_reply_to_header, references_header
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            msg_id, neg_id, "OUTBOUND", patient_name, provider_name,
            f"Formal Billing Dispute & Settlement Offer [{tracking_code}]",
            initial_letter,
            json.dumps({"type": "INITIAL_DISPUTE", "offer_amount": initial_offer}),
            json.dumps({"recommendation": "Awaiting response from hospital billing department (allow 14-30 days)."}),
            "SENT", now,
            root_msg_id, None, root_msg_id
        ))

        conn.commit()
        conn.close()

        return NegotiationRepository.get_negotiation(neg_id)

    @staticmethod
    def get_negotiation(negotiation_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM negotiations WHERE id = ? OR tracking_code = ?", (negotiation_id, negotiation_id))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None

        neg = dict(row)
        if neg.get("audit_summary_json"):
            neg["audit_summary"] = json.loads(neg["audit_summary_json"])
        if neg.get("payment_instructions_json"):
            neg["payment_instructions"] = json.loads(neg["payment_instructions_json"])
        else:
            neg["payment_instructions"] = None

        cursor.execute("SELECT * FROM negotiation_messages WHERE negotiation_id = ? ORDER BY created_at ASC", (neg["id"],))
        messages = []
        for msg_row in cursor.fetchall():
            m = dict(msg_row)
            if m.get("analysis_json"):
                m["analysis"] = json.loads(m["analysis_json"])
            if m.get("proposed_action_json"):
                m["proposed_action"] = json.loads(m["proposed_action_json"])
            messages.append(m)

        neg["messages"] = messages
        conn.close()

        # The revised bill is only released once the completion fee is paid.
        neg["completion_paid"] = bool(neg.get("completion_paid"))
        neg["commitment_paid"] = bool(neg.get("commitment_paid"))
        neg["revised_bill_has_pdf"] = bool(neg.get("revised_bill_pdf_path"))
        neg["revised_bill_available"] = bool(neg.get("revised_bill_markdown")) or neg["revised_bill_has_pdf"]
        # The file path never leaves the server, and the text is hidden until the fee is paid.
        neg.pop("revised_bill_pdf_path", None)
        if not neg["completion_paid"]:
            neg["revised_bill_markdown"] = None
        if neg.get("revised_bill_check_json"):
            neg["revised_bill_check"] = json.loads(neg["revised_bill_check_json"])
        return neg

    @staticmethod
    def list_negotiations() -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, tracking_code, provider_name, patient_name, account_number, total_billed, current_demanded_balance, current_offer, status, auto_pilot_enabled, updated_at FROM negotiations ORDER BY updated_at DESC")
        items = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return items

    @staticmethod
    def add_message(
        negotiation_id: str,
        direction: str,
        sender: str,
        recipient: str,
        subject: str,
        content_markdown: str,
        analysis: Optional[Dict[str, Any]] = None,
        proposed_action: Optional[Dict[str, Any]] = None,
        status: str = "RECEIVED",
        message_id_header: Optional[str] = None,
        in_reply_to_header: Optional[str] = None,
        references_header: Optional[str] = None
    ) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        msg_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        cursor.execute("""
        INSERT INTO negotiation_messages (
            id, negotiation_id, direction, sender, recipient, subject,
            content_markdown, analysis_json, proposed_action_json, status, created_at,
            message_id_header, in_reply_to_header, references_header
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            msg_id, negotiation_id, direction, sender, recipient, subject,
            content_markdown,
            json.dumps(analysis) if analysis else None,
            json.dumps(proposed_action) if proposed_action else None,
            status, now,
            message_id_header, in_reply_to_header, references_header
        ))

        # Update last_message_id on negotiation if provided
        if message_id_header:
            cursor.execute("UPDATE negotiations SET last_message_id = ? WHERE id = ?", (message_id_header, negotiation_id))

        # Update negotiation status if provided in analysis
        if analysis and "new_status" in analysis:
            new_status = analysis["new_status"]
            new_balance = analysis.get("revised_balance")
            if new_balance is not None:
                cursor.execute("UPDATE negotiations SET status = ?, current_demanded_balance = ?, updated_at = ? WHERE id = ?", (new_status, new_balance, now, negotiation_id))
            else:
                cursor.execute("UPDATE negotiations SET status = ?, updated_at = ? WHERE id = ?", (new_status, now, negotiation_id))
        else:
            cursor.execute("UPDATE negotiations SET updated_at = ? WHERE id = ?", (now, negotiation_id))

        conn.commit()
        conn.close()

        return {"id": msg_id, "created_at": now}

    @staticmethod
    def set_support_email(negotiation_id: str, support_email: str):
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            "UPDATE negotiations SET support_email = ?, updated_at = ? WHERE id = ?",
            (support_email, now, negotiation_id),
        )
        conn.commit()
        conn.close()

    @staticmethod
    def reconcile_root_message_id(
        negotiation_id: str,
        real_message_id: str,
        previous_message_id: Optional[str],
    ):
        """Rewrites the thread root to the Message-ID the mail provider actually used.

        Resend assigns its own Message-ID and ignores the one this engine
        generated, so without this the negotiation is rooted on an id that
        exists nowhere, every reply quotes an id with no match, and
        inbound_poller silently fails to thread any of them. The message row
        is rewritten in the same transaction as the negotiation: a half-done
        reconcile would leave the two disagreeing about the same thread.
        """
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            "UPDATE negotiations SET root_message_id = ?, last_message_id = ?, updated_at = ? WHERE id = ?",
            (real_message_id, real_message_id, now, negotiation_id),
        )
        cursor.execute(
            "UPDATE negotiation_messages SET message_id_header = ?, references_header = ? "
            "WHERE negotiation_id = ? AND message_id_header = ?",
            (real_message_id, real_message_id, negotiation_id, previous_message_id),
        )
        conn.commit()
        conn.close()

    # Fields an admin may correct through the edit-field endpoint. The
    # column name cannot be parameterised, so it is interpolated -- which
    # makes the allowlist the only thing standing between a caller and
    # arbitrary SQL in that statement.
    #
    # Money, status, payment and paywall columns are deliberately absent.
    # Each has its own endpoint that records why it changed and keeps the
    # fee arithmetic consistent; free-text editing of settled_amount or
    # completion_paid would walk straight past all of it.
    EDITABLE_FIELDS = frozenset({
        "provider_name",
        "patient_name",
        "account_number",
        "hospital_email",
        "patient_email",
        "support_email",
        "admin_notes",
    })

    @staticmethod
    def set_editable_field(negotiation_id: str, field: str, value: Any):
        if field not in NegotiationRepository.EDITABLE_FIELDS:
            allowed = ", ".join(sorted(NegotiationRepository.EDITABLE_FIELDS))
            raise ValueError(f"'{field}' is not an editable field. Editable fields are: {allowed}.")
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            f"UPDATE negotiations SET {field} = ?, updated_at = ? WHERE id = ? OR tracking_code = ?",
            (value, now, negotiation_id, negotiation_id),
        )
        conn.commit()
        conn.close()

    @staticmethod
    def update_negotiation_offer(negotiation_id: str, new_offer: float, new_status: str = "COUNTER_OFFER_SENT"):
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("UPDATE negotiations SET current_offer = ?, status = ?, updated_at = ? WHERE id = ?", (new_offer, new_status, now, negotiation_id))
        conn.commit()
        conn.close()

    @staticmethod
    def update_threading(negotiation_id: str, last_message_id: str, root_message_id: Optional[str] = None):
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        if root_message_id:
            cursor.execute("UPDATE negotiations SET last_message_id = ?, root_message_id = ?, updated_at = ? WHERE id = ?", (last_message_id, root_message_id, now, negotiation_id))
        else:
            cursor.execute("UPDATE negotiations SET last_message_id = ?, updated_at = ? WHERE id = ?", (last_message_id, now, negotiation_id))
        conn.commit()
        conn.close()

    @staticmethod
    def set_payment_instructions(negotiation_id: str, instructions: Dict[str, Any]):
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("UPDATE negotiations SET payment_instructions_json = ?, status = 'SETTLED', updated_at = ? WHERE id = ?", (json.dumps(instructions), now, negotiation_id))
        conn.commit()
        conn.close()

    @staticmethod
    def toggle_auto_pilot(negotiation_id: str, enabled: bool):
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("UPDATE negotiations SET auto_pilot_enabled = ?, updated_at = ? WHERE id = ?", (1 if enabled else 0, now, negotiation_id))
        conn.commit()
        conn.close()

    @staticmethod
    def record_edit(negotiation_id: str, field: str, old_val: Any, new_val: Any, reason: str, actor: str = "User") -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("SELECT edit_history_json FROM negotiations WHERE id = ? OR tracking_code = ?", (negotiation_id, negotiation_id))
        row = cursor.fetchone()
        history = json.loads(row["edit_history_json"]) if row and row["edit_history_json"] else []
        entry = {
            "actor": actor,
            "field": field,
            "old_val": old_val,
            "new_val": new_val,
            "reason": reason,
            "timestamp": now,
        }
        history.append(entry)
        cursor.execute("UPDATE negotiations SET edit_history_json = ?, updated_at = ? WHERE id = ? OR tracking_code = ?", (json.dumps(history), now, negotiation_id, negotiation_id))
        conn.commit()
        conn.close()
        return entry

    @staticmethod
    def record_rescan(negotiation_id: str, what_changed: str, additional_savings: float, explanation: str) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("SELECT rescan_count, rescan_history_json FROM negotiations WHERE id = ? OR tracking_code = ?", (negotiation_id, negotiation_id))
        row = cursor.fetchone()
        count = (row["rescan_count"] or 0) if row else 0
        if count >= 1:
            conn.close()
            raise ValueError("1-time user rescan limit has already been reached for this case.")
        
        history = json.loads(row["rescan_history_json"]) if row and row["rescan_history_json"] else []
        entry = {
            "timestamp": now,
            "what_changed": what_changed,
            "additional_savings": additional_savings,
            "explanation": explanation,
            "iteration": count + 1,
        }
        history.append(entry)
        cursor.execute("UPDATE negotiations SET rescan_count = ?, rescan_history_json = ?, updated_at = ? WHERE id = ? OR tracking_code = ?", (count + 1, json.dumps(history), now, negotiation_id, negotiation_id))
        conn.commit()
        conn.close()
        return entry

    @staticmethod
    def record_admin_rerun(negotiation_id: str, instructions: str, scope: str, result: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("SELECT admin_rerun_count, admin_rerun_history_json FROM negotiations WHERE id = ? OR tracking_code = ?", (negotiation_id, negotiation_id))
        row = cursor.fetchone()
        count = (row["admin_rerun_count"] or 0) if row else 0
        history = json.loads(row["admin_rerun_history_json"]) if row and row["admin_rerun_history_json"] else []
        entry = {
            "version": count + 2,
            "instructions": instructions,
            "scope": scope,
            "timestamp": now,
            "result_summary": result.get("summary", ""),
            "proposed_offer": result.get("proposed_offer"),
            "savings": result.get("savings"),
        }
        history.append(entry)
        cursor.execute("UPDATE negotiations SET admin_rerun_count = ?, admin_rerun_history_json = ?, updated_at = ? WHERE id = ? OR tracking_code = ?", (count + 1, json.dumps(history), now, negotiation_id, negotiation_id))
        conn.commit()
        conn.close()
        return entry

    @staticmethod
    def update_cadence(negotiation_id: str, step: int, status: str, draft: Optional[str] = None):
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        if draft:
            cursor.execute("UPDATE negotiations SET cadence_step = ?, cadence_status = ?, no_response_notice_draft = ?, updated_at = ? WHERE id = ? OR tracking_code = ?", (step, status, draft, now, negotiation_id, negotiation_id))
        else:
            cursor.execute("UPDATE negotiations SET cadence_step = ?, cadence_status = ?, updated_at = ? WHERE id = ? OR tracking_code = ?", (step, status, now, negotiation_id, negotiation_id))
        conn.commit()
        conn.close()

    @staticmethod
    def close_case(negotiation_id: str, reason: str, approved_by_admin: bool = True, guidance: Optional[str] = None):
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("UPDATE negotiations SET status = 'CLOSED_NO_RESPONSE', closed_reason = ?, closure_approved_by_admin = ?, updated_at = ? WHERE id = ? OR tracking_code = ?", (reason, 1 if approved_by_admin else 0, now, negotiation_id, negotiation_id))
        conn.commit()
        conn.close()

