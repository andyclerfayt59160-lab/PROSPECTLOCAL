import logging
import importlib.util
import json
import hashlib
import os
import socket
import subprocess
import sys
import threading
import time
import tempfile
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
import uvicorn
from dotenv import load_dotenv
from PySide6.QtCore import QTimer, QUrl, Qt
from PySide6.QtGui import QAction, QDesktopServices
from PySide6.QtWebEngineCore import QWebEnginePage
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMainWindow, QMessageBox, QToolBar


APP_NAME = "ProspectLocal Desktop"
BACKEND_PORT = 8011
FRONTEND_PORT = 8085
BACKEND_TITLE = "Prospection Scanner API"


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


ROOT = app_root()
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
DIST_DIR = FRONTEND_DIR / "dist_live"
if not DIST_DIR.exists():
    DIST_DIR = FRONTEND_DIR / "dist"
APP_INSTALL_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT
APP_METADATA_FILE = ROOT / "desktop_app_metadata.json"

LOG_DIR = Path.home() / "AppData" / "Local" / "ProspectLocal"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "desktop.log"
LOCAL_DESKTOP_CONFIG_FILE = LOG_DIR / "desktop-config.json"
APP_DESKTOP_CONFIG_FILE = APP_INSTALL_DIR / "desktop-config.json"
BACKEND_OVERRIDE_ENV_FILE = LOG_DIR / "backend.override.env"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=(
        [logging.FileHandler(LOG_FILE, encoding="utf-8")]
        if getattr(sys, "frozen", False)
        else [
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ]
    ),
)
logger = logging.getLogger("prospectlocal.desktop")


def load_json_file(path: Path) -> dict:
    try:
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        logger.warning("Unable to read JSON file %s", path)
        return {}


def load_app_metadata() -> dict:
    metadata = {
        "app_name": APP_NAME,
        "version": "1.1.0",
        "release_channel": "stable",
        "update_manifest_url": "",
    }
    metadata.update(load_json_file(APP_METADATA_FILE))
    return metadata


APP_METADATA = load_app_metadata()
APP_VERSION = str(APP_METADATA.get("version") or "1.1.0")
RELEASE_CHANNEL = str(APP_METADATA.get("release_channel") or "stable")


def load_desktop_config() -> dict:
    merged = {}
    merged.update(load_json_file(APP_DESKTOP_CONFIG_FILE))
    merged.update(load_json_file(LOCAL_DESKTOP_CONFIG_FILE))
    return merged


def expand_config_value(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return os.path.expanduser(os.path.expandvars(raw))


def seed_runtime_override_if_requested(config: dict) -> None:
    if BACKEND_OVERRIDE_ENV_FILE.exists():
        return
    if not config.get("seed_shared_backend_on_first_run"):
        return

    shared_env_file = BACKEND_DIR / ".env.shared"
    if not shared_env_file.exists():
        logger.warning("Shared backend template missing: %s", shared_env_file)
        return

    BACKEND_OVERRIDE_ENV_FILE.write_text(shared_env_file.read_text(encoding="utf-8"), encoding="utf-8")
    logger.info("Seeded shared backend runtime override from bundled template")


def version_key(version: str) -> tuple[int, ...]:
    chunks = []
    for raw_part in str(version).replace("-", ".").split("."):
        digits = "".join(char for char in raw_part if char.isdigit())
        if digits:
            chunks.append(int(digits))
    return tuple(chunks or [0])


def resolve_update_manifest_source(config: dict) -> str:
    return expand_config_value(
        os.getenv("PROSPECTLOCAL_UPDATE_MANIFEST_URL", "").strip()
        or str(config.get("update_manifest_url") or "").strip()
        or str(APP_METADATA.get("update_manifest_url") or "").strip()
    )


def read_manifest_payload(source: str) -> tuple[dict | None, str | None]:
    if not source:
        return None, "Aucune source de mise a jour configuree."

    parsed = urlparse(source)
    try:
        if parsed.scheme in {"http", "https"}:
            response = requests.get(source, timeout=5)
            response.raise_for_status()
            return response.json(), None

        manifest_path = Path(source)
        if not manifest_path.exists():
            return None, f"Manifest introuvable: {manifest_path}"
        return json.loads(manifest_path.read_text(encoding="utf-8-sig")), None
    except Exception as exc:
        return None, f"Impossible de lire le manifest de mise a jour: {exc}"


def resolve_manifest_child(manifest_source: str, child: str) -> str:
    parsed = urlparse(child)
    if parsed.scheme in {"http", "https"}:
        return child

    manifest_parsed = urlparse(manifest_source)
    if manifest_parsed.scheme in {"http", "https"}:
        return urljoin(manifest_source, child)

    return str((Path(manifest_source).parent / child).resolve())


def resolve_update_info(config: dict) -> tuple[dict | None, str | None]:
    manifest_source = resolve_update_manifest_source(config)
    payload, error = read_manifest_payload(manifest_source)
    if error:
        return None, error
    if not payload:
        return None, "Manifest de mise a jour vide."

    version = str(payload.get("version") or payload.get("latest_version") or "").strip()
    if not version:
        return None, "Manifest sans version."
    if version_key(version) <= version_key(APP_VERSION):
        return None, None

    windows_payload = payload.get("windows") or {}
    installer_ref = str(
        windows_payload.get("installer")
        or windows_payload.get("installer_url")
        or payload.get("installer")
        or payload.get("installer_url")
        or ""
    ).strip()
    if not installer_ref:
        return None, "Manifest sans installateur Windows."

    return {
        "version": version,
        "notes": str(payload.get("notes") or "").strip(),
        "manifest_source": manifest_source,
        "installer_source": resolve_manifest_child(manifest_source, installer_ref),
        "sha256": str(windows_payload.get("sha256") or payload.get("sha256") or "").strip().lower(),
    }, None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def materialize_update_installer(info: dict) -> Path:
    installer_source = str(info.get("installer_source") or "")
    if not installer_source:
        raise RuntimeError("Source installateur absente.")

    parsed = urlparse(installer_source)
    if parsed.scheme in {"http", "https"}:
        target_path = Path(tempfile.gettempdir()) / f"ProspectLocalSetup-{info['version']}.exe"
        with requests.get(installer_source, stream=True, timeout=20) as response:
            response.raise_for_status()
            with target_path.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        output.write(chunk)
    else:
        target_path = Path(expand_config_value(installer_source))
        if not target_path.exists():
            raise FileNotFoundError(f"Installateur introuvable: {target_path}")

    expected_hash = str(info.get("sha256") or "").strip().lower()
    if expected_hash:
        actual_hash = sha256_file(target_path)
        if actual_hash != expected_hash:
            raise RuntimeError("Le hash de l'installateur ne correspond pas au manifest.")

    return target_path


def is_port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def wait_for_http(url: str, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            response = requests.get(url, timeout=1.0)
            if response.status_code < 500:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def is_prospectlocal_backend(port: int) -> bool:
    try:
        response = requests.get(f"http://127.0.0.1:{port}/openapi.json", timeout=1.5)
        if response.status_code >= 400:
            return False
        payload = response.json()
        title = payload.get("info", {}).get("title", "")
        return title == BACKEND_TITLE
    except Exception:
        return False


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
        requested = Path(self.translate_path(self.path))
        if self.path.startswith("/_expo/") or self.path.startswith("/assets/"):
            return super().do_GET()
        if requested.exists():
            return super().do_GET()
        self.path = "/index.html"
        return super().do_GET()

    def log_message(self, format, *args):
        return


class ReuseWindowPage(QWebEnginePage):
    def __init__(self, browser, parent=None):
        super().__init__(parent)
        self.browser = browser

    def createWindow(self, _type):
        page = QWebEnginePage(self)

        def handle_url(url):
            if not url.isValid():
                return
            if url.host() in {"127.0.0.1", "localhost"}:
                self.browser.setUrl(url)
            else:
                QDesktopServices.openUrl(url)

        page.urlChanged.connect(handle_url)
        return page

    def acceptNavigationRequest(self, url, navigation_type, is_main_frame):
        if url.isValid() and url.scheme() in {"http", "https", "tel"}:
            if url.host() not in {"127.0.0.1", "localhost"}:
                QDesktopServices.openUrl(url)
                return False
        return super().acceptNavigationRequest(url, navigation_type, is_main_frame)

    def javaScriptConsoleMessage(self, level, message, line_number, source_id):
        logger.info("JS console [%s] %s:%s %s", level, source_id, line_number, message)
        super().javaScriptConsoleMessage(level, message, line_number, source_id)


class ProspectLocalWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.desktop_config = load_desktop_config()
        self.setWindowTitle(f"{APP_NAME} {APP_VERSION}")
        self.resize(1460, 940)
        self._screen_placed = False
        self.backend_server = None
        self.frontend_server = None
        self.backend_thread = None
        self.frontend_thread = None
        self.update_check_done = False

        self.browser = QWebEngineView()
        self.page = ReuseWindowPage(self.browser, self.browser)
        self.browser.setPage(self.page)
        self.browser.loadFinished.connect(self._inject_desktop_scroll_behavior)
        self.setCentralWidget(self.browser)
        self._build_toolbar()
        self._start_services()
        QTimer.singleShot(0, self._place_on_preferred_screen)

    def _place_on_preferred_screen(self):
        if self._screen_placed:
            return

        app = QApplication.instance()
        if not app:
            return

        screens = app.screens()
        if len(screens) < 2:
            logger.info("Single screen detected, keeping main window on primary display")
            self._screen_placed = True
            return

        primary_screen = app.primaryScreen()
        target_screen = next((screen for screen in screens if screen != primary_screen), screens[-1])
        available = target_screen.availableGeometry()

        width = min(self.width(), available.width())
        height = min(self.height(), available.height())
        x = available.x() + max((available.width() - width) // 2, 0)
        y = available.y() + max((available.height() - height) // 2, 0)

        handle = self.windowHandle()
        if handle is not None:
            handle.setScreen(target_screen)

        self.setGeometry(x, y, width, height)
        self._screen_placed = True
        logger.info("Main window placed on secondary screen: %s", target_screen.name())

    def _build_toolbar(self):
        toolbar = QToolBar("Navigation")
        toolbar.setMovable(False)
        toolbar.setToolButtonStyle(Qt.ToolButtonTextBesideIcon)
        self.addToolBar(toolbar)

        action_home = QAction("Accueil", self)
        action_home.triggered.connect(lambda: self.browser.setUrl(QUrl(f"http://127.0.0.1:{FRONTEND_PORT}/")))
        toolbar.addAction(action_home)

        action_reload = QAction("Rafraichir", self)
        action_reload.triggered.connect(self.browser.reload)
        toolbar.addAction(action_reload)

        action_updates = QAction("Verifier MAJ", self)
        action_updates.triggered.connect(lambda: self._check_for_updates(auto=False))
        toolbar.addAction(action_updates)

    def _start_services(self):
        try:
            logger.info("Starting desktop services")
            self._start_backend()
            self._start_frontend()

            backend_ok = wait_for_http(f"http://127.0.0.1:{BACKEND_PORT}/docs", timeout=25)
            frontend_ok = wait_for_http(f"http://127.0.0.1:{FRONTEND_PORT}/", timeout=25)

            if not backend_ok or not frontend_ok:
                logger.error("Startup incomplete backend_ok=%s frontend_ok=%s", backend_ok, frontend_ok)
                QMessageBox.critical(
                    self,
                    "Demarrage incomplet",
                    f"Le logiciel n'a pas reussi a lancer correctement ses services internes.\n\nLog: {LOG_FILE}",
                )

            self.browser.setUrl(QUrl(f"http://127.0.0.1:{FRONTEND_PORT}/"))
            QTimer.singleShot(2000, lambda: self._check_for_updates(auto=True))
        except Exception:
            logger.error("Desktop startup failed:\n%s", traceback.format_exc())
            QMessageBox.critical(
                self,
                "Erreur de demarrage",
                f"Le logiciel a rencontre une erreur au lancement.\n\nConsulte le log ici :\n{LOG_FILE}",
            )

    def _check_for_updates(self, auto: bool):
        if auto and self.update_check_done:
            return
        self.update_check_done = True

        update_info, error = resolve_update_info(self.desktop_config)
        if error:
            logger.info("Update check skipped/error: %s", error)
            if not auto and "Aucune source de mise a jour configuree." not in error:
                QMessageBox.warning(self, "Mise a jour", error)
            elif not auto:
                QMessageBox.information(
                    self,
                    "Mise a jour",
                    "Aucune source de mise a jour n'est configuree.\n\n"
                    "Ajoute un desktop-config.json a cote de l'executable ou dans "
                    f"{LOCAL_DESKTOP_CONFIG_FILE}",
                )
            return

        if not update_info:
            if not auto:
                QMessageBox.information(
                    self,
                    "Mise a jour",
                    f"Tu es deja sur la derniere version ({APP_VERSION}).",
                )
            return

        message = (
            f"Une nouvelle version est disponible : {update_info['version']}\n"
            f"Version actuelle : {APP_VERSION}\n\n"
            "Veux-tu telecharger et lancer l'installation maintenant ?"
        )
        if update_info.get("notes"):
            message += f"\n\nNotes:\n{update_info['notes']}"

        answer = QMessageBox.question(
            self,
            "Mise a jour disponible",
            message,
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.Yes if auto else QMessageBox.StandardButton.No,
        )
        if answer != QMessageBox.StandardButton.Yes:
            return

        self._install_update(update_info)

    def _install_update(self, update_info: dict):
        try:
            installer_path = materialize_update_installer(update_info)
            logger.info("Launching installer update from %s", installer_path)
            subprocess.Popen(
                [
                    str(installer_path),
                    "/SP-",
                    "/CLOSEAPPLICATIONS",
                    "/RESTARTAPPLICATIONS",
                ]
            )
            QApplication.instance().quit()
        except Exception as exc:
            logger.error("Update install failed:\n%s", traceback.format_exc())
            QMessageBox.critical(
                self,
                "Mise a jour impossible",
                f"La mise a jour n'a pas pu etre lancee.\n\n{exc}",
            )

    def _inject_desktop_scroll_behavior(self, ok: bool):
        if not ok:
            return

        script = r"""
        (() => {
          const oldWidget = document.getElementById('prospectlocal-scroll-aid');
          if (oldWidget) oldWidget.remove();
          const oldRail = document.getElementById('prospectlocal-scroll-rail');
          if (oldRail) oldRail.remove();
          const oldStyle = document.getElementById('prospectlocal-desktop-scroll-style');
          if (oldStyle) oldStyle.remove();

          const style = document.createElement('style');
          style.id = 'prospectlocal-desktop-scroll-style';
          style.textContent = `
            html, body, #root {
              height: 100% !important;
            }

            body {
              overflow-y: auto !important;
              overflow-x: hidden !important;
              scrollbar-width: auto;
            }

            [data-rnw-scrollable="true"] {
              overflow-y: auto !important;
              scrollbar-width: auto;
            }

            *::-webkit-scrollbar {
              width: 10px;
              height: 10px;
            }

            *::-webkit-scrollbar-track {
              background: rgba(148, 163, 184, 0.08);
            }

            *::-webkit-scrollbar-thumb {
              background: rgba(100, 116, 139, 0.35);
              border-radius: 999px;
              border: 2px solid rgba(255,255,255,0.85);
            }

            *::-webkit-scrollbar-thumb:hover {
              background: rgba(71, 85, 105, 0.62);
            }
          `;
          document.head.appendChild(style);

          const markScrollableNodes = () => {
            document.querySelectorAll('[data-rnw-scrollable="true"]').forEach((node) => {
              node.removeAttribute('data-rnw-scrollable');
            });

            document.querySelectorAll('*').forEach((element) => {
              if (!(element instanceof HTMLElement)) return;
              const computedStyle = window.getComputedStyle(element);
              const overflowY = computedStyle.overflowY;
              const isScrollable =
                element.scrollHeight - element.clientHeight > 120 &&
                element.clientHeight > 220 &&
                (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay');

              if (isScrollable) {
                element.setAttribute('data-rnw-scrollable', 'true');
              }
            });
          };

          markScrollableNodes();
          window.addEventListener('resize', markScrollableNodes);
          setTimeout(markScrollableNodes, 600);
          setTimeout(markScrollableNodes, 1600);
        })();
        """
        self.page.runJavaScript(script)

    def _start_backend(self):
        if is_port_open(BACKEND_PORT):
            if is_prospectlocal_backend(BACKEND_PORT):
                logger.info("ProspectLocal backend already listening on %s", BACKEND_PORT)
                return
            raise RuntimeError(
                f"Le port backend {BACKEND_PORT} est deja utilise par un autre service. "
                "ProspectLocal ne peut pas demarrer son backend."
            )

        logger.info("Loading backend from %s", BACKEND_DIR)
        load_dotenv(BACKEND_DIR / ".env")
        seed_runtime_override_if_requested(self.desktop_config)
        if BACKEND_OVERRIDE_ENV_FILE.exists():
            load_dotenv(BACKEND_OVERRIDE_ENV_FILE, override=True)
            logger.info("Loaded runtime backend override from %s", BACKEND_OVERRIDE_ENV_FILE)
        sys.path.insert(0, str(BACKEND_DIR))

        try:
            spec = importlib.util.spec_from_file_location("prospectlocal_backend_server", BACKEND_DIR / "server.py")
            module = importlib.util.module_from_spec(spec)
            assert spec and spec.loader
            spec.loader.exec_module(module)
            app = module.app
        except Exception:
            logger.error("Backend import failed:\n%s", traceback.format_exc())
            raise

        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=BACKEND_PORT,
            log_level="warning",
            access_log=False,
            log_config=None,
        )
        self.backend_server = uvicorn.Server(config)
        logger.info("Backend server configured")

        def run_backend():
            logger.info("Backend thread starting")
            self.backend_server.run()

        self.backend_thread = threading.Thread(target=run_backend, daemon=True)
        self.backend_thread.start()

    def _start_frontend(self):
        if is_port_open(FRONTEND_PORT):
            logger.info("Frontend already listening on %s", FRONTEND_PORT)
            return

        logger.info("Serving SPA from %s", DIST_DIR)
        self.frontend_server = ThreadingHTTPServer(("127.0.0.1", FRONTEND_PORT), SpaHandler)

        def run_frontend():
            logger.info("Frontend thread starting")
            self.frontend_server.serve_forever()

        self.frontend_thread = threading.Thread(target=run_frontend, daemon=True)
        self.frontend_thread.start()

    def closeEvent(self, event):
        try:
            if self.frontend_server:
                self.frontend_server.shutdown()
                self.frontend_server.server_close()
            if self.backend_server:
                self.backend_server.should_exit = True
        finally:
            super().closeEvent(event)


def main():
    logger.info("Launching %s", APP_NAME)
    app = QApplication(sys.argv)
    window = ProspectLocalWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
