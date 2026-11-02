"""
Settings shared across the engine. Everything comes from the environment (see .env.example).
"""

import os

# The address the advocate writes from. Letters and emails are signed with it.
ADVOCATE_EMAIL = os.getenv("ADVOCATE_EMAIL") or os.getenv("SMTP_FROM") or "advocate@example.com"
