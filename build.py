#!/usr/bin/env python3
"""
NWN MDL Viewer — Build Script
Assembles all source files into a single distributable dist/index.html.

Usage:
  python build.py          → produces dist/index.html
  python build.py --watch  → rebuilds on file change (requires 'watchdog')
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

JS_ORDER = [
    'i18n.js',
    'parser.js',
    'scene.js',
    'scene_build.js',
    'textures.js',
    'session.js',
    'ui.js',
    'log.js',
    'loader.js',
    'animation.js',
]

def read(path):
    return Path(path).read_text(encoding='utf-8')

def build():
    DIST.mkdir(exist_ok=True)

    html = read(SRC)

    # 1. Inline CSS
    css_content = read(CSS)
    html = html.replace(
        '<link rel="stylesheet" href="css/viewer.css">',
        f'<style>\n{css_content}\n</style>'
    )

    # 2. Remove Google Fonts preconnect (keep for CDN build, optional)
    # Keep it — it's a <link rel="preconnect"> which is fine in single-file too.

    # 3. Inline all JS files
    js_tags = '\n'.join(f'<script src="js/{f}"></script>' for f in JS_ORDER)
    js_combined = '\n\n'.join(
        f'// ═══ {f} ═══\n{read(JS_DIR / f)}' for f in JS_ORDER
    )
    html = html.replace(
        '<!-- NWN MDL Viewer — Module -->\n' + js_tags,
        f'<script>\n{js_combined}\n</script>'
    )

    # 4. Write output
    out = DIST / 'index.html'
    out.write_text(html, encoding='utf-8')
    size_kb = out.stat().st_size // 1024
    print(f'✓  Built: dist/index.html  ({size_kb} KB)')

    # 5. Copy lang/ folder into dist/ for GitHub Pages
    lang_src = ROOT / 'lang'
    lang_dst = DIST / 'lang'
    if lang_dst.exists():
        shutil.rmtree(lang_dst)
    shutil.copytree(lang_src, lang_dst)
    print(f'✓  Copied: lang/ → dist/lang/')

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
