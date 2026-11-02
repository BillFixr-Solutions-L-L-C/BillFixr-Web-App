# BillFixr automation engine

A Python service that runs the audit rules and the negotiation autopilot. The web app calls it over HTTP, the same way it calls `services/ai-service`.

It does the following for a case:

1. **Audits** extracted bill data. Every finding has a source, a confidence level (`high` or `needs_review`), and a citation from a closed, approved list.
2. **Builds the first dispute letter** on the server from the audit findings and sends it to the hospital.
3. **Runs the negotiation on autopilot.** It sends follow-ups on a timer, reads hospital replies from the inbox, answers a rejected dispute with a rebuttal, and accepts an agreed reduction.
4. **Asks for the revised bill** after the hospital accepts. It reads the reply and any PDF attachment, and checks that the bill shows the agreed amount. If it does not, it asks the hospital to correct it.
5. **Calculates the completion fee** (a share of savings, rounded up to the next dollar) and keeps the revised bill locked until the web app confirms the client paid.
6. **Posts notices** for the client in the case timeline.

The engine does not take payments and does not know who the user is. The web app charges the client, authorises the user, and tells the engine what happened. See [INTEGRATION.md](INTEGRATION.md).

## Run it

```bash
cd services/automation-engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # then fill it in
TESTING=1 python server.py    # TESTING=1 keeps it off real email and the real inbox
```

The API docs are at <http://localhost:8000/docs>. A demo UI is at <http://localhost:8000/> while `ENABLE_DEMO_UI=1`.

With Docker (the image has the demo UI off and keeps its data in `/app/data`):

```bash
docker build -t billfixr-automation-engine .
docker run -p 8000:8000 --env-file .env -v engine-data:/app/data billfixr-automation-engine
```

## Test it

```bash
python -m pytest
```

The tests use a throwaway database, never send email, and make no network calls.

## Layout

| Path | What it is |
| --- | --- |
| `server.py` | HTTP API, the API key check, and the autopilot timer |
| `engine/audit_engine.py`, `engine/benchmarks.json` | Audit rules, benchmark rates, approved citations |
| `engine/letter_generator.py` | The first dispute letter |
| `engine/negotiator.py` | Autopilot: replies, settlement, revised bill, notices |
| `engine/revised_bill.py` | Reads the revised bill (text and PDF) and checks the amount |
| `engine/payments.py` | Fee rules |
| `engine/contact_finder.py`, `engine/provider_directory.json` | Hospital billing contact lookup from a sourced directory. It never guesses |
| `engine/email_dispatcher.py`, `engine/inbound_poller.py` | Sending email and reading replies |
| `database.py` | SQLite store. Replace it with the web app's storage (see INTEGRATION.md) |
| `static/`, `demo_assets/`, `engine/demo_data.py` | Demo only. Do not ship |
| `tests/` | The test suite |

## Configuration

Everything comes from the environment. [.env.example](.env.example) lists every variable with a comment.
