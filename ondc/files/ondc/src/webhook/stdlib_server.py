"""
Zero-dependency fallback webhook (stdlib http.server).

Mirrors the FastAPI routes in app.py so the lead-capture flow can be tested
anywhere Python runs — sandboxes, CI, a client's bare VPS — without
installing FastAPI/uvicorn. Use app.py in production.

Run:  python -m src.webhook.stdlib_server [port]
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.leads.store import save_lead  # noqa: E402

BUSINESS_GPS = os.getenv("BUSINESS_GPS", "12.9416,77.7400")
BUSINESS_KEYWORDS = [k.strip() for k in
                     os.getenv("BUSINESS_KEYWORDS", "physiotherapy,rehab").split(",")]
ACK = {"message": {"ack": {"status": "ACK"}}}


class Handler(BaseHTTPRequestHandler):
    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send({"status": "ok", "gps": BUSINESS_GPS,
                        "keywords": BUSINESS_KEYWORDS})
        else:
            self._send({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._send({"message": {"ack": {"status": "NACK"}},
                               "error": {"type": "JSON-ERROR"}}, 400)

        if self.path == "/search":
            result = save_lead(direction="inbound_demand", payload=payload,
                               business_gps=BUSINESS_GPS,
                               business_keywords=BUSINESS_KEYWORDS)
            print(f"[LEAD] inbound demand captured: {result}")
            self._send(ACK)
        elif self.path == "/on_search":
            save_lead(direction="outbound_discovery", payload=payload,
                      business_gps=BUSINESS_GPS,
                      business_keywords=BUSINESS_KEYWORDS)
            self._send(ACK)
        else:
            self._send({"error": "not found"}, 404)

    def log_message(self, fmt, *args):  # quieter logs
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"KaushalStack lead webhook (stdlib) on :{port}")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
