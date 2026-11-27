"""The gateway forwarder (`agents.FORWARDER_JS`) sets the key on every request, passes the rest through, passes a cut stream on as a cut, and
adds a wait to a 429 that names none.

SUBSTITUTE_JUSTIFICATION
- replaces: the lab gateway, the forwarder's upstream, with a local HTTP server
- necessity: the assertions need the headers and body the upstream received, which the real gateway does not expose; it is reachable only from the lab network
- real-proof: each Codex attempt's `forwarder.txt`: the proof (the gateway answers /v1/models with 200 only for a valid key) and the attempt's own requests
"""

import http.client
import http.server
import queue
import shutil
import subprocess
import threading
import unittest

from evals.agents import FORWARDER_JS, FORWARDER_RETRY_AFTER

KEY = "sk-forwarder-test-key"
STREAM = [b"data: 0\n\n", b"data: 1\n\n", b"data: 2\n\n"]


class Upstream(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    seen: list[dict] = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length") or 0))
        Upstream.seen.append({"path": self.path, "authorization": self.headers.get("authorization"), "host": self.headers.get("host"), "body": body})
        if self.path.endswith(("/limited", "/limited-wait")):
            self.send_response(429)
            if self.path.endswith("/limited-wait"):
                self.send_header("retry-after", "7")
            self.send_header("content-length", "0")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("transfer-encoding", "chunked")
        self.end_headers()
        chunks = STREAM[:1] if self.path.endswith("/cut") else STREAM
        for chunk in chunks:
            self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
            self.wfile.flush()
        if self.path.endswith("/cut"):
            self.close_connection = True  # closes without the last chunk
            return
        self.wfile.write(b"0\r\n\r\n")

    def log_message(self, *args):
        pass


@unittest.skipUnless(shutil.which("node"), "node is not installed")
class ForwarderTest(unittest.TestCase):
    def setUp(self):
        Upstream.seen = []
        self.upstream = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        threading.Thread(target=self.upstream.serve_forever, daemon=True).start()
        self.addCleanup(self.upstream.server_close)
        self.addCleanup(self.upstream.shutdown)

    def start(self, key: str) -> tuple[subprocess.Popen, queue.Queue]:
        target = f"http://127.0.0.1:{self.upstream.server_port}/gw/"
        proc = subprocess.Popen(["node", "--input-type=module", "-e", FORWARDER_JS, "0", target, str(FORWARDER_RETRY_AFTER)],
                                stdin=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        lines: queue.Queue = queue.Queue()
        reader = threading.Thread(target=lambda: [lines.put(line) for line in proc.stderr], daemon=True)
        reader.start()
        self.addCleanup(proc.stderr.close)
        self.addCleanup(reader.join, 10)
        self.addCleanup(proc.wait, 10)
        self.addCleanup(proc.kill)
        proc.stdin.write(key + "\n")
        proc.stdin.close()
        return proc, lines

    def listening_port(self, lines: queue.Queue) -> int:
        line = lines.get(timeout=10)
        self.assertIn("listening on 127.0.0.1:", line)
        return int(line.rsplit(":", 1)[1])

    def post(self, port: int, path: str) -> http.client.HTTPResponse:
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        self.addCleanup(conn.close)
        conn.request("POST", path, body=b'{"model": "m"}', headers={"Authorization": "Bearer placeholder", "Content-Type": "application/json"})
        return conn.getresponse()

    def test_the_upstream_gets_the_key_the_path_and_the_body_and_the_client_gets_the_stream(self):
        _, lines = self.start(KEY)
        response = self.post(self.listening_port(lines), "/v1/responses")
        self.assertEqual(response.status, 200)
        self.assertEqual(response.read(), b"".join(STREAM))
        [seen] = Upstream.seen
        self.assertEqual(seen["authorization"], f"Bearer {KEY}")
        self.assertEqual(seen["path"], "/gw/v1/responses")
        self.assertEqual(seen["host"], f"127.0.0.1:{self.upstream.server_port}")
        self.assertEqual(seen["body"], b'{"model": "m"}')

    def test_a_cut_upstream_stream_reaches_the_client_as_a_cut(self):
        _, lines = self.start(KEY)
        response = self.post(self.listening_port(lines), "/v1/cut")
        self.assertEqual(response.status, 200)
        with self.assertRaises(http.client.IncompleteRead):
            response.read()

    def test_a_429_that_names_no_wait_reaches_the_client_with_one_and_an_upstream_wait_is_kept(self):
        _, lines = self.start(KEY)
        port = self.listening_port(lines)
        limited = self.post(port, "/v1/limited")
        self.assertEqual((limited.status, limited.getheader("retry-after")), (429, str(FORWARDER_RETRY_AFTER)))
        waited = self.post(port, "/v1/limited-wait")
        self.assertEqual((waited.status, waited.getheader("retry-after")), (429, "7"))

    def test_no_key_on_stdin_stops_the_forwarder(self):
        proc, lines = self.start("")
        self.assertEqual(proc.wait(timeout=10), 2)
        self.assertIn("no key on stdin", lines.get(timeout=5))


if __name__ == "__main__":
    unittest.main()
