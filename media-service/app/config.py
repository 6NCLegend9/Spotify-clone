"""Single-instance resource and trust configuration."""
import os
from pathlib import Path
from urllib.parse import urlsplit

GIB = 1024**3


def origin(value: str) -> str:
    parsed = urlsplit(value)
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (parsed.scheme != "https" and not (local and parsed.scheme == "http")) or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ValueError("Configure an HTTPS origin, or HTTP loopback for development")
    return value.rstrip("/")


class Config:
    def __init__(self):
        self.api_key = os.environ.get("MEDIA_API_KEY", "")
        self.lease_key = os.environ.get("MEDIA_LEASE_SECRET", "")
        if len(self.api_key) < 32 or len(self.lease_key) < 32:
            raise ValueError("MEDIA_API_KEY and MEDIA_LEASE_SECRET require at least 32 characters")
        self.public_origin = origin(os.environ.get("MEDIA_PUBLIC_ORIGIN", "http://127.0.0.1:8090"))
        self.origins = [origin(v.strip()) for v in os.environ.get("MEDIA_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if v.strip()]
        self.cache = Path(os.environ.get("MEDIA_CACHE_DIR", "/tmp/haykasa-media")).resolve()
        self.js_runtime = os.environ.get("MEDIA_JS_RUNTIME", "node:/usr/local/bin/node")
        self.workers = 2
        self.queue_size = 8
        self.extract_deadline = 45
        self.prepare_deadline = 120
        self.duration_limit = 1800
        self.file_limit = GIB
        self.disk_limit = 8 * GIB
        self.ttl = 6 * 3600
        self.lease_seconds = 2 * 3600
