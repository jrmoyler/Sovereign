#!/usr/bin/env python3
"""Tiny static file server for SOVEREIGN.

No build step. Just serves the project folder with the correct MIME types
(notably .glb and ES module .js) so the game runs from a local URL.

    python3 serve.py            # http://localhost:8000
    python3 serve.py 8080       # custom port
"""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".wasm": "application/wasm",
        ".json": "application/json",
    }

    def end_headers(self):
        # Allow the module graph + assets to load without cache surprises during dev.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):  # keep the console quiet
        pass


with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"SOVEREIGN running at http://localhost:{PORT}  (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
