"""Local Laya server for the purchase classifier (client/laya.ts).

Serves the open-source Laya model on this machine with the same
POST /v1/systemone request and response shape as the hosted API.

    server/.venv/bin/python server/laya_server.py

The first start downloads the English checkpoint (about 808 MB) from Hugging Face.
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import laya

HOST = os.environ.get("LAYA_HOST", "127.0.0.1")
PORT = int(os.environ.get("LAYA_PORT", "8000"))
MAX_BODY = 512 * 1024

agent = laya.load("convaiinnovations/laya")
lock = threading.Lock()  # one forward pass at a time


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200, {"status": "ok", "model": "convaiinnovations/laya", "device": str(agent.device)})

    def do_POST(self):
        if self.path != "/v1/systemone":
            return self.reply(404, {"error": {"message": "Not found"}})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > MAX_BODY:
                return self.reply(413, {"error": {"message": "Request too large"}})
            body = json.loads(self.rfile.read(length))
            state, questions = body["state"], body["questions"]
        except (ValueError, KeyError, TypeError):
            return self.reply(400, {"error": {"message": "Expected JSON with state and questions"}})
        try:
            with lock:
                result = agent.predict(state, questions)
        except Exception as e:  # invalid question, model failure
            return self.reply(422, {"error": {"message": str(e)}})
        self.reply(200, result)


if __name__ == "__main__":
    print(f"Laya on http://{HOST}:{PORT} ({agent.device})", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
