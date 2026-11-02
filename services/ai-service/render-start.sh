#!/bin/bash
# Starts the API and the job worker in one container.
#
# docker-compose runs these as two services sharing a volume. On Render a
# disk attaches to exactly one service, and both halves read and write the
# same SQLite file — the API enqueues a job, the worker picks it up — so
# splitting them into a web service and a background worker would give each
# its own disk and its own database. Jobs would be enqueued into a file
# nothing was reading.
#
# If the worker dies the container exits rather than carrying on as an API
# that accepts uploads and never processes any of them.
set -e

# bash, not sh: `wait -n` below is a bash builtin and dash — which is
# /bin/sh in the slim image — does not have it.
: "${PORT:=8000}"

# --use-ai is not the default in scripts/run_worker.py, and without it the
# worker does not call the configured extraction provider. docker-compose
# omits it; this is production, so it is set.
python scripts/run_worker.py --interval 3 --limit 10 --use-ai &
WORKER_PID=$!

# Stop the worker with the container rather than leaving it orphaned.
trap 'kill "$WORKER_PID" 2>/dev/null || true' INT TERM

uvicorn app.main:app --host 0.0.0.0 --port "$PORT" &
API_PID=$!

# Exit as soon as either half stops, so Render restarts the container
# instead of running on in half-working state.
wait -n "$WORKER_PID" "$API_PID"
EXIT_CODE=$?
kill "$WORKER_PID" "$API_PID" 2>/dev/null || true
exit "$EXIT_CODE"
