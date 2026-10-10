"""Signed, expiring delivery of local complete files with byte-range support."""
import hashlib
import hmac
import re
import time
from urllib.parse import urlencode
from fastapi import HTTPException
from fastapi.responses import Response, StreamingResponse


def signature(key, asset_id, expiry):
    return hmac.new(key.encode(), f"{asset_id}:{expiry}".encode(), hashlib.sha256).hexdigest()


def lease(config, asset):
    expiry = int(time.time()) + config.lease_seconds
    asset["leased_until"] = max(asset.get("leased_until", 0), expiry)
    query = urlencode({"expires": expiry, "signature": signature(config.lease_key, asset["id"], expiry)})
    return {**asset["descriptor"], "url": f"{config.public_origin}/v1/assets/{asset['id']}?{query}", "expiresAt": expiry * 1000}


def deliver(config, asset, request, expiry, token):
    if expiry < time.time() or expiry > time.time() + config.lease_seconds + 60 or not hmac.compare_digest(signature(config.lease_key, asset["id"], expiry), token):
        raise HTTPException(403, "lease_invalid")
    path = asset["path"]
    if not path.is_file():
        raise HTTPException(404, "asset_unavailable")
    size = path.stat().st_size
    asset["accessed"] = time.time()
    start, end, status = 0, size - 1, 200
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
    value = request.headers.get("range")
    if value:
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
        try:
            if not match or not any(match.groups()):
                raise ValueError()
            left, right = match.groups()
            if left:
                start = int(left)
                end = min(int(right), size - 1) if right else size - 1
            else:
                length = int(right)
                if length <= 0:
                    raise ValueError()
                start = max(0, size - length)
            if start > end or start >= size:
                raise ValueError()
        except ValueError:
            return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{size}"})
        status = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    length = end - start + 1
    headers["Content-Length"] = str(length)
    mime = asset["descriptor"]["mimeType"]
    if request.method == "HEAD":
        return Response(status_code=status, headers=headers, media_type=mime)

    def chunks():
        with path.open("rb") as source:
            source.seek(start)
            remaining = length
            while remaining:
                chunk = source.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
    return StreamingResponse(chunks(), status_code=status, headers=headers, media_type=mime)
