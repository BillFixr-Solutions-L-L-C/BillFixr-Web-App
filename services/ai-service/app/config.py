from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"
    log_file: Path = Path("logs/billfixr.log")

    local_api_key: str | None = None
    local_default_role: str = "admin"

    openai_api_key: str | None = None
    openai_extraction_model: str = "gpt-5-mini"
    openrouter_api_key: str | None = None
    openrouter_extraction_model: str = "openai/gpt-4o-mini"
    # When True, the model is called only if the regex extractor's output
    # fails validation -- which sounds like a cost saving and is in fact a
    # way of never calling the model at all. The regex extractor has no
    # line-item parsing, and validate_extraction() checks at most three
    # fields on a hospital bill and nothing whatsoever on an EOB, so its
    # output routinely scores 1.0 while carrying no charges and no line
    # items. Observed in production on 2026-11-04: both uploaded bills
    # came back with model_used=null and "AI extraction skipped because
    # deterministic extraction passed validation", while the same model on
    # the same text returned the full claim table when called directly.
    # Default False: the model is the extractor, and the regex pass is the
    # fallback for when it fails. Set True only to deliberately re-enter
    # the cheap-path-first mode.
    ai_fallback_on_validation_failure: bool = False

    imap_host: str | None = None
    imap_port: int = 993
    imap_username: str | None = None
    imap_password: str | None = None
    imap_mailbox: str = "INBOX"
    email_lookback_days: int = 7

    storage_dir: Path = Path(".billfixr-data")
    cache_dir: Path = Path(".billfixr-cache")
    database_path: Path = Path(".billfixr-data/billfixr.sqlite3")
    max_upload_bytes: int = 25 * 1024 * 1024
    allowed_upload_extensions: str = (
        ".pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,.txt,.text,.md,.csv,.tsv,"
        ".json,.jsonl,.xml,.html,.htm,.eml,.docx,.xlsx"
    )
    storage_encryption_key: str | None = None
    malware_scan_enabled: bool = True
    clamav_enabled: bool = False
    clamscan_path: str = "clamscan"

    enable_ocr: bool = True
    ocr_engine: str = "tesseract"
    paddle_ocr_timeout_seconds: int = 20
    tesseract_cmd: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
