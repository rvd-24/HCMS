"""Central settings, read once from the environment (.env at the project root).

Every path the old scripts resolved relative to the current working directory
(token.json, credentials.json, prescriptions/, data/visits.json) is anchored to
PROJECT_ROOT here instead, so the CLI and the web server behave the same no
matter where they're launched from.
"""
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


def _path(env_name: str, default: Path) -> Path:
    value = os.environ.get(env_name)
    return Path(value) if value else default


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: _path("PRESCRIPT_DATA_DIR", PROJECT_ROOT / "data"))
    secrets_dir: Path = field(default_factory=lambda: _path("PRESCRIPT_SECRETS_DIR", PROJECT_ROOT / "secrets"))
    prescriptions_dir: Path = field(default_factory=lambda: _path("PRESCRIPT_IMAGES_DIR", PROJECT_ROOT / "prescriptions"))

    # Deliberately not DATABASE_URL — that name in .env already points at another
    # project's ceddatabase, and this app must never write into it by accident.
    # Supabase: use the session pooler URI (port 5432 on *.pooler.supabase.com) —
    # the direct db.<ref>.supabase.co host is IPv6-only.
    database_url: str = field(default_factory=lambda: os.environ.get("PRESCRIPT_DATABASE_URL", ""))

    jwt_secret: str = field(default_factory=lambda: os.environ.get("PRESCRIPT_JWT_SECRET", "dev-only-insecure-secret-change-me-in-env"))
    jwt_ttl_minutes: int = field(default_factory=lambda: int(os.environ.get("PRESCRIPT_JWT_TTL_MINUTES", "720")))
    cors_origins: tuple = field(
        default_factory=lambda: tuple(
            o.strip() for o in os.environ.get("PRESCRIPT_CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
        )
    )

    clinic_name: str = field(default_factory=lambda: os.environ.get("CLINIC_NAME", "Kalinga Institute of Dental Sciences (KIDS)"))
    clinic_timezone: str = field(default_factory=lambda: os.environ.get("CLINIC_TIMEZONE", "Asia/Kolkata"))
    default_slot_minutes: int = field(default_factory=lambda: int(os.environ.get("DEFAULT_SLOT_MINUTES", "30")))

    # Email safety switches, enforced in integrations.dispatch for every outgoing
    # message. Email is OFF unless explicitly enabled, and while a redirect address
    # is set, every email goes to it instead of the real patient/doctor/pharmacy.
    # Google Calendar invites are emails too, so they follow email_enabled.
    email_enabled: bool = field(default_factory=lambda: os.environ.get("PRESCRIPT_EMAIL_ENABLED", "false").strip().lower() in ("1", "true", "yes"))
    email_redirect: str = field(default_factory=lambda: os.environ.get("PRESCRIPT_EMAIL_REDIRECT", "").strip())

    # Plain OpenAI takes precedence over Azure when OPENAI_API_KEY is set.
    openai_api_key: str = field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", "").strip())
    openai_model: str = field(default_factory=lambda: os.environ.get("OPENAI_MODEL", "gpt-5.4"))

    azure_openai_endpoint: str = field(default_factory=lambda: os.environ.get("AZURE_OPENAI_ENDPOINT", ""))
    azure_openai_key: str = field(default_factory=lambda: os.environ.get("AZURE_OPENAI_KEY", ""))
    azure_openai_deployment: str = field(default_factory=lambda: os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4"))
    # .env historically used AZURE_API_VERSION while the code read
    # AZURE_OPENAI_API_VERSION, so the .env value was silently ignored. Accept both.
    azure_openai_api_version: str = field(
        default_factory=lambda: os.environ.get("AZURE_OPENAI_API_VERSION")
        or os.environ.get("AZURE_API_VERSION")
        or "2024-08-01-preview"
    )

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def legacy_visits_json(self) -> Path:
        return self.data_dir / "visits.json"

    @property
    def google_credentials_path(self) -> Path:
        return self.secrets_dir / "credentials.json"

    @property
    def google_token_path(self) -> Path:
        return self.secrets_dir / "token.json"

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url
        if not url:
            return f"sqlite:///{(self.data_dir / 'prescript.db').as_posix()}"
        # Supabase and most hosts hand out postgres:// or postgresql:// URLs;
        # point those at the psycopg (v3) driver this project installs.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        return url

    @property
    def llm_provider(self) -> str:
        """'openai', 'azure', or '' when extraction isn't configured."""
        if self.openai_api_key:
            return "openai"
        if self.azure_openai_endpoint and self.azure_openai_key:
            return "azure"
        return ""

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_provider)


@lru_cache
def get_settings() -> Settings:
    return Settings()
