"""Runs before any test module is imported. Keeps tests on a throwaway database and off live email.

The suite runs against whichever backend database.py would use in
production, selected here:

    ENGINE_TEST_DATABASE_URL set    -> PostgreSQL, the production backend.
    ENGINE_TEST_DATABASE_URL unset  -> SQLite in a temp dir (the default).

Both are run in CI. That is deliberate: these tests are the only thing
standing between a dialect mistake and a production engine that cannot
read its own negotiations, and a suite that only ever ran on SQLite would
agree with the code instead of checking it -- the same way a mock with no
RLS once agreed with a query that could not actually read its table.
"""

import os
import tempfile

_workdir = tempfile.mkdtemp(prefix="engine-tests-")
os.environ["TESTING"] = "1"  # no live SMTP, no live inbox
os.environ["ENGINE_DATA_DIR"] = os.path.join(_workdir, "data")
os.environ.pop("ENGINE_API_KEY", None)

# The contact lookup calls the federal NPI registry over the network. Off by
# default in tests, so the curated-directory tests stay deterministic and the
# suite does not fail when CMS is slow or down. test_nppes.py turns it back
# on against recorded payloads instead of the live API.
os.environ["NPPES_DISABLED"] = "1"

# Likewise the web search for a billing email: it calls OpenRouter and then
# fetches whatever page the model names. Off by default so no test can spend
# money or depend on a hospital's website being up. test_contact_search.py
# turns it back on against stubbed replies.
os.environ["CONTACT_SEARCH_DISABLED"] = "1"

_test_url = os.environ.pop("ENGINE_TEST_DATABASE_URL", "").strip()

if _test_url:
    # This drops the engine's tables, so it refuses to point at anything
    # that is not plainly a test database. ENGINE_TEST_DATABASE_URL is a
    # separate variable from ENGINE_DATABASE_URL for the same reason: a
    # machine with production credentials in its environment cannot have
    # the suite aimed at them by accident.
    import psycopg
    from urllib.parse import urlparse

    _name = (urlparse(_test_url).path or "").lstrip("/")
    if "test" not in _name.lower():
        raise RuntimeError(
            f"ENGINE_TEST_DATABASE_URL points at database {_name!r}, which is not named as a "
            "test database. The suite drops the engine's tables; refusing to run."
        )

    # Dropped before database.py is imported, so init_db() builds it from
    # scratch -- the same starting point the SQLite run gets from a fresh
    # temp file. The whole schema goes, not the two tables by name: the
    # engine keeps them in a schema of its own, and dropping by bare name
    # would silently resolve against `public` and remove nothing.
    _schema = os.environ.get("ENGINE_DB_SCHEMA", "engine")
    with psycopg.connect(_test_url, autocommit=True) as _conn:
        _conn.execute(f"DROP SCHEMA IF EXISTS {_schema} CASCADE")

    os.environ["ENGINE_DATABASE_URL"] = _test_url
else:
    # Popped, not merely left alone: otherwise a real ENGINE_DATABASE_URL
    # in the developer's environment would quietly become the test target.
    os.environ.pop("ENGINE_DATABASE_URL", None)
    os.environ["ENGINE_DB_PATH"] = os.path.join(_workdir, "engine.db")
