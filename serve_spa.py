from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parent / "frontend"
DIST_DIR = BASE_DIR / "dist_live"
if not DIST_DIR.exists():
    DIST_DIR = BASE_DIR / "dist"
PORT = int(os.environ.get("PROSPECTLOCAL_PORT", "8085"))


class SpaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def end_headers(self):
        if self.path.endswith(".html"):
            self.send_header("Content-Type", "text/html; charset=utf-8")
        elif self.path.endswith(".js"):
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
        elif self.path.endswith(".css"):
            self.send_header("Content-Type", "text/css; charset=utf-8")
        elif self.path.endswith(".json"):
            self.send_header("Content-Type", "application/json; charset=utf-8")
        super().end_headers()

    def do_GET(self):
        requested = self.translate_path(self.path)
        if self.path.startswith("/_expo/") or self.path.startswith("/assets/"):
            return super().do_GET()

        if Path(requested).exists():
            return super().do_GET()

        self.path = "/index.html"
        return super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), SpaHandler)
    print(f"ProspectLocal SPA server running on http://127.0.0.1:{PORT}")
    server.serve_forever()
