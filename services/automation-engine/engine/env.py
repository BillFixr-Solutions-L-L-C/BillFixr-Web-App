"""Loading the engine's own .env, and nothing else's.

`load_dotenv()` with no path searches upwards from the working directory
until it finds a `.env` — which on a developer machine can mean a file
belonging to an entirely different project several directories up. With
`override=True`, as every call in this service used, that file's values
then beat the real environment.

That is not hypothetical. A `.env` in the home directory, left over from
another project, silently rebound this server to its `PORT` instead of the
one the environment asked for.

Pointing at the service's own directory keeps the convenience — edit
`.env` beside `server.py` and it still wins locally — without the engine
inheriting whatever happens to sit above it. The deployed image has no
`.env` at all (it is in `.dockerignore`), so in production only the real
environment is ever read.
"""

import os
from dotenv import load_dotenv

# <repo>/services/automation-engine/.env — this file is engine/env.py.
SERVICE_ENV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")


def load_service_env(override: bool = False) -> None:
    load_dotenv(dotenv_path=SERVICE_ENV, override=override)
