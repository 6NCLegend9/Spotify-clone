"""Bound actual ASGI request bytes, including bodies without Content-Length."""
from fastapi.responses import JSONResponse


class JobBodyLimit:
    def __init__(self, app, max_bytes=4096):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope.get('path', '').startswith('/v1/jobs') or scope.get('method') not in {'POST', 'PUT', 'PATCH', 'DELETE'}:
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        length = headers.get(b'content-length')
        if length is not None and (not length.isdigit() or len(length) > 10 or int(length) > self.max_bytes):
            return await JSONResponse({'detail': 'request_size_invalid'}, status_code=413)(scope, receive, send)
        data = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            if message['type'] != 'http.request':
                continue
            chunk = message.get('body', b'')
            if len(data) + len(chunk) > self.max_bytes:
                return await JSONResponse({'detail': 'request_size_invalid'}, status_code=413)(scope, receive, send)
            data.extend(chunk)
            if not message.get('more_body', False):
                break
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': bytes(data), 'more_body': False}
            return await receive()

        await self.app(scope, bounded_receive, send)
