#!/usr/bin/env python3
"""
NWN MDL Viewer — Build Script
Assembles all source files into a single distributable dist/index.html.

Usage:
  python build.py          → produces dist/index.html
  python build.py --watch  → rebuilds on file change (requires 'watchdog')

WASM-Handling:
  - dist/wasm/cleanmodels.wasm  wird für GitHub Pages (HTTP-Modus) kopiert.
  - js/cleanmodels_wasm.js (Base64) wird in die Standalone-HTML eingebettet,
    damit file://-Modus ohne Server funktioniert. Die Datei muss dafür
    vorhanden sein — sie wird vom Workflow update-wasm.yml erzeugt.
"""

import os
import re
import sys
import shutil
from pathlib import Path

ROOT   = Path(__file__).parent
DIST   = ROOT / 'dist'
SRC    = ROOT / 'index.html'
CSS    = ROOT / 'css' / 'viewer.css'
JS_DIR = ROOT / 'js'
WASM_DIR      = ROOT / 'wasm'
WASM_B64_FILE = JS_DIR / 'cleanmodels_wasm.js'   # Base64-Bundle für file://-Modus

def read(path):
    return Path(path).read_text(encoding='utf-8')

def extract_js_order(html: str) -> list[str]:
    """
    Liest die JS-Dateireihenfolge direkt aus der index.html.
    Erfasst alle <script src="js/..."> Tags zwischen dem
    '<!-- NWN MDL Viewer — Module -->' Kommentar und </body>.
    """
    section_match = re.search(
        r'<!-- NWN MDL Viewer — Module -->(.*?)</body>',
        html,
        re.DOTALL
    )
    if not section_match:
        raise ValueError(
            'Marker "<!-- NWN MDL Viewer — Module -->" nicht in index.html gefunden.'
        )

    section = section_match.group(1)
    files = re.findall(r'<script\s+src="js/([^"]+\.js)"', section)

    if not files:
        raise ValueError(
            'Keine <script src="js/..."> Tags nach dem Modul-Marker gefunden.'
        )

    return files


def build():
    DIST.mkdir(exist_ok=True)

    html = read(SRC)

    # ── 0. JS-Reihenfolge aus der HTML ableiten ──────────────────────────────
    js_order = extract_js_order(html)
    print(f'  JS-Dateien ({len(js_order)}): {", ".join(js_order)}')

    # ── 1. Inline CSS ─────────────────────────────────────────────────────────
    css_content = read(CSS)
    html = html.replace(
        '<link rel="stylesheet" href="css/viewer.css">',
        f'<style>\n{css_content}\n</style>'
    )

    # ── 2. WASM-Base64 für Standalone-HTML (file://-Modus) ───────────────────
    # cleanmodels_wasm.js definiert CM_WASM_B64. Wenn es vor cleanmodels.js
    # eingebettet wird, ist die Variable bereits vorhanden und der dynamische
    # Script-Load in cleanmodels.js wird übersprungen.
    wasm_b64_content = None
    if WASM_B64_FILE.exists():
        wasm_b64_content = read(WASM_B64_FILE)
        size_mb = WASM_B64_FILE.stat().st_size / 1048576
        print(f'  WASM Base64: {WASM_B64_FILE.name} ({size_mb:.1f} MB) — wird eingebettet')
    else:
        print(f'  WARNUNG: {WASM_B64_FILE} nicht gefunden.')
        print(f'           Standalone-HTML unterstützt keinen file://-Modus für binäre MDLs.')
        print(f'           → Workflow update-wasm.yml ausführen oder generate_wasm_b64.sh aufrufen.')

    # ── 3. Alle JS-Dateien inlinen ────────────────────────────────────────────
    js_parts = []
    for f in js_order:
        if f == 'cleanmodels.js' and wasm_b64_content:
            # Base64-Bundle direkt vor cleanmodels.js einbetten
            js_parts.append(f'// ═══ cleanmodels_wasm.js (eingebettet) ═══\n{wasm_b64_content}')
        js_parts.append(f'// ═══ {f} ═══\n{read(JS_DIR / f)}')

    js_combined = '\n\n'.join(js_parts)
    replacement = f'<script>\n{js_combined}\n</script>'
    html = re.sub(
        r'<!-- NWN MDL Viewer — Module -->.*?(?=\n</body>)',
        lambda m: replacement,
        html,
        flags=re.DOTALL
    )

    # ── 4. Standalone-HTML schreiben ──────────────────────────────────────────
    out = DIST / 'index.html'
    out.write_text(html, encoding='utf-8')
    size_kb = out.stat().st_size // 1024
    print(f'✓  Built: dist/index.html  ({size_kb} KB)')

    # ── 5. lang/ für GitHub Pages kopieren ────────────────────────────────────
    lang_src = ROOT / 'lang'
    lang_dst = DIST / 'lang'
    if lang_dst.exists():
        shutil.rmtree(lang_dst)
    shutil.copytree(lang_src, lang_dst)
    print(f'✓  Copied: lang/ → dist/lang/')

    # ── 6. wasm/ für GitHub Pages (HTTP-Modus) kopieren ──────────────────────
    # Im HTTP-Modus holt cleanmodels.js die .wasm per fetch() — dafür muss
    # dist/wasm/cleanmodels.wasm vorhanden sein.
    wasm_dst = DIST / 'wasm'
    if wasm_dst.exists():
        shutil.rmtree(wasm_dst)
    if WASM_DIR.exists():
        shutil.copytree(WASM_DIR, wasm_dst)
        wasm_file = wasm_dst / 'cleanmodels.wasm'
        if wasm_file.exists():
            size_mb = wasm_file.stat().st_size / 1048576
            print(f'✓  Copied: wasm/ → dist/wasm/  (cleanmodels.wasm: {size_mb:.1f} MB)')
        else:
            print(f'  WARNUNG: wasm/cleanmodels.wasm fehlt — HTTP-Modus funktioniert nicht.')
    else:
        print(f'  WARNUNG: wasm/ Verzeichnis nicht gefunden — HTTP-Modus funktioniert nicht.')

    return out


if __name__ == '__main__':
    if '--watch' in sys.argv:
        try:
            from watchdog.observers import Observer
            from watchdog.events import FileSystemEventHandler
            import time

            class Handler(FileSystemEventHandler):
                def on_modified(self, event):
                    if event.src_path.endswith(('.html', '.css', '.js', '.json')):
                        print(f'  Changed: {event.src_path}')
                        try:
                            build()
                        except Exception as e:
                            print(f'  Build error: {e}')

            observer = Observer()
            observer.schedule(Handler(), str(ROOT), recursive=True)
            observer.start()
            print('Watching for changes… (Ctrl+C to stop)')
            build()
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                observer.stop()
            observer.join()
        except ImportError:
            print('watchdog not installed. Run: pip install watchdog')
            sys.exit(1)
    else:
        build()
