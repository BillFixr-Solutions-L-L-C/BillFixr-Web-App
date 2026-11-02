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
    ai_fallback_on_validation_failure: bool = True

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
