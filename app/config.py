import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = BASE_DIR / "index.html"

# External PHP Receiver URL (Primary source of truth for all data & storage)
PHP_STORAGE_URL = os.environ.get("PHP_STORAGE_URL", "https://cdn.jisanfx.top/chatdatabase/reciever.php").strip()

# Cookie and session settings
SESSION_COOKIE_NAME = "chat_session"
COOKIE_MAX_AGE = 90 * 24 * 60 * 60  # 90 days in seconds
SESSION_EXPIRY_DAYS = 90

# ─────────────────────────────────────────────────────────────
# ADMIN CONTROLS: Account Creation / Registration Toggle
# ─────────────────────────────────────────────────────────────
# Set ALLOW_REGISTRATION = False to disable new account signups.
# Set ALLOW_REGISTRATION = True to allow visitors to register.
# You can also override via environment variable: ALLOW_REGISTRATION=true/false
ALLOW_REGISTRATION: bool = os.environ.get("ALLOW_REGISTRATION", "false").strip().lower() in ("true", "1", "yes")

# Optional secret key to toggle registration remotely via API without code restart
ADMIN_SECRET_KEY: str = os.environ.get("ADMIN_SECRET_KEY", "livechat_admin_secret_2026").strip()


def is_registration_enabled() -> bool:
    """Check if new account creation is currently permitted."""
    return bool(ALLOW_REGISTRATION)


def set_registration_enabled(enabled: bool) -> bool:
    """Admin function to dynamically toggle registration ON or OFF."""
    global ALLOW_REGISTRATION
    ALLOW_REGISTRATION = bool(enabled)
    return ALLOW_REGISTRATION

