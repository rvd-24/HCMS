"""Uploaded files in a private Supabase Storage bucket.

Documents stored there have a stored_path of "storage://<key>". Everything that needs the
file still asks records.resolve_path() for a local path; for bucket files that's a copy in
data/storage-cache, downloaded on first use. Files are only ever served through the
authenticated API, never by a bucket URL.
"""
from pathlib import Path
from typing import Optional

import requests

from ..config import get_settings

PREFIX = "storage://"
TIMEOUT = 60


class StorageError(RuntimeError):
    pass


def is_stored(stored_path: str) -> bool:
    return stored_path.startswith(PREFIX)


def key_of(stored_path: str) -> str:
    return stored_path[len(PREFIX):]


def _object_url(key: str) -> str:
    s = get_settings()
    return f"{s.supabase_url}/storage/v1/object/{s.storage_bucket}/{key}"


def _headers(**extra) -> dict:
    key = get_settings().supabase_service_key
    return {"Authorization": f"Bearer {key}", "apikey": key, **extra}


def upload(key: str, data: bytes, content_type: Optional[str]) -> str:
    """Store the bytes under key (overwriting) and return the stored_path for it."""
    r = requests.post(
        _object_url(key), data=data, timeout=TIMEOUT,
        headers=_headers(**{"Content-Type": content_type or "application/octet-stream", "x-upsert": "true"}),
    )
    if r.status_code >= 300:
        raise StorageError(f"Upload of {key} failed ({r.status_code}): {r.text[:200]}")
    return PREFIX + key


def download(key: str) -> bytes:
    r = requests.get(_object_url(key), headers=_headers(), timeout=TIMEOUT)
    if r.status_code >= 300:
        raise StorageError(f"Download of {key} failed ({r.status_code}): {r.text[:200]}")
    return r.content


def delete(key: str) -> None:
    s = get_settings()
    r = requests.delete(f"{s.supabase_url}/storage/v1/object/{s.storage_bucket}", json={"prefixes": [key]},
                        headers=_headers(), timeout=TIMEOUT)
    if r.status_code >= 300:
        raise StorageError(f"Delete of {key} failed ({r.status_code}): {r.text[:200]}")


def cache_path(key: str) -> Path:
    return get_settings().storage_cache_dir / key


def local_copy(key: str) -> Path:
    """Path to a local copy of the bucket object, downloading it if it isn't cached yet."""
    path = cache_path(key)
    if not path.exists():
        data = download(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".part")
        tmp.write_bytes(data)
        tmp.replace(path)  # atomic, so a half-written file is never served
    return path
