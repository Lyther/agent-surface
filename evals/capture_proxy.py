"""Forward model requests unchanged to the real provider and keep each request body, so a listing capture
shows exactly what the host put in front of the model. Request headers (which carry credentials) are never saved.

Usage: python3 capture_proxy.py UPSTREAM_BASE_URL LOCAL_PORT OUT_DIR
The host is pointed at http://127.0.0.1:LOCAL_PORT as its provider base URL; request paths are appended to the upstream base.
"""

from __future__ import annotations

import http.client
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

UPSTREAM = urllib.parse.urlsplit(sys.argv[1])
OUT = Path(sys.argv[3])
HOP = {"host", "content-length", "connection", "transfer-encoding", "accept-encoding"}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"
    count = 0

    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        Handler.count += 1
        (OUT / f"{Handler.count:03d}.json").write_bytes(body)
        conn = http.client.HTTPSConnection(UPSTREAM.netloc, timeout=300)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        conn.request("POST", UPSTREAM.path.rstrip("/") + self.path, body, headers)
        reply = conn.getresponse()
        self.send_response(reply.status)
        for key, value in reply.getheaders():
            if key.lower() not in HOP:
                self.send_header(key, value)
        self.end_headers()
        while chunk := reply.read(4096):
            self.wfile.write(chunk)
            self.wfile.flush()

    def log_message(self, *_args) -> None:
        return


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[2])), Handler).serve_forever()
