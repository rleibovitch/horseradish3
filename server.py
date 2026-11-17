#!/usr/bin/env python3
"""Local Horseradish server. Operator switch is whoever is on this machine."""
from __future__ import annotations

import json
import os
import re
import time
import traceback
from html import unescape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

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


def private_host(hostname: str) -> bool:
    host = (hostname or "").strip().lower().strip("[]")
    if not host or host in {"localhost", "0.0.0.0", "::1"}:
        return True
    if host.endswith(".local") or host.endswith(".internal") or host.endswith(".localhost"):
        return True
    parts = host.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        a, b = int(parts[0]), int(parts[1])
        if a in {0, 10, 127}:
            return True
        if a == 169 and b == 254:
            return True
        if a == 172 and 16 <= b <= 31:
            return True
        if a == 192 and b == 168:
            return True
    return False


def crawl_site(raw: str) -> tuple[int, dict]:
    try:
        parsed = urlparse((raw or "").strip())
    except ValueError:
        return 400, {"message": "Give it a public https website."}
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return 400, {"message": "Give it a public https website."}
    if private_host(parsed.hostname):
        return 400, {"message": "Give it a public https website."}
    href = parsed.geturl()
    try:
        req = Request(
            href,
            headers={
                "User-Agent": "HorseradishHost/1.0 (+https://horseradish.ai)",
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            },
            method="GET",
        )
        with urlopen(req, timeout=8) as res:
            final = res.geturl()
            check = urlparse(final)
            if check.scheme != "https" or private_host(check.hostname or ""):
                return 400, {"message": "Give it a public https website."}
            raw_html = res.read(400001)
            if len(raw_html) > 400000:
                return 413, {"message": "That page is too large to chew."}
            html = raw_html.decode("utf-8", "ignore")
            href = final
    except URLError:
        return 502, {"message": "The site did not open."}
    title_m = re.search(r"<title[^>]*>([\s\S]*?)</title>", html, re.I)
    title = unescape(re.sub(r"\s+", " ", title_m.group(1) if title_m else "")).strip()
    body = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    body = re.sub(r"<style[\s\S]*?</style>", " ", body, flags=re.I)
    body = re.sub(r"<[^>]+>", " ", body)
    body = unescape(re.sub(r"\s+", " ", body)).strip()
    text = "\n\n".join(part for part in (title, body) if part)[:8000]
    if not text:
        return 422, {"message": "No knowledge came off that page."}
    host = urlparse(href).hostname or ""
    return 200, {
        "ok": True,
        "url": href,
        "host": host,
        "title": (title or host or "Site")[:120],
        "description": "",
        "text": text,
        "chars": len(text),
        "at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    }


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
        if path == "/api/crawl":
            body = self.read_json()
            status, payload = crawl_site(str(body.get("url") or ""))
            self.send_json(status, payload)
            return
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
