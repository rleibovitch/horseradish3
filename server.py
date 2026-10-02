#!/usr/bin/env python3
"""Local Horseradish server. Operator switch is whoever is on this machine."""
from __future__ import annotations

import json
import os
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
OPERATOR = "Roni"
PRESENCE_PATH = ROOT / "operator.json"
PORT = int(os.environ.get("PORT", "8080"))


def default_presence() -> dict:
    return {
        "online": False,
        "lastSeen": None,
        "operator": OPERATOR,
        "trigger": None,
    }


def read_presence() -> dict:
    try:
        data = json.loads(PRESENCE_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return default_presence()


def write_presence(data: dict) -> None:
    PRESENCE_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)

    def send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0 or length > 4000:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}

    def do_GET(self) -> None:
        try:
            path = urlparse(self.path).path
            if path == "/api/presence":
                self.send_json(200, read_presence())
                return
            if path == "/api/session":
                self.send_json(200, {"operator": OPERATOR, "local": True})
                return
            super().do_GET()
        except Exception:
            traceback.print_exc()
            raise

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/presence":
            self.send_error(404)
            return
        body = self.read_json()
        presence = {
            "online": bool(body.get("online")),
            "lastSeen": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "operator": OPERATOR,
            "trigger": "panel",
        }
        write_presence(presence)
        presence["persisted"] = True
        self.send_json(200, presence)


def main() -> None:
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Horseradish  http://127.0.0.1:{PORT}/", flush=True)
    print(f"Operator     http://127.0.0.1:{PORT}/operator.html", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
