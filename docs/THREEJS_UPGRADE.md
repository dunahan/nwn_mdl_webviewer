# Three.js Upgrade & ES Module Migration Plan

**Status:** planning only — nothing in this document has been implemented yet.
Referenced from `vendor/README.md` (provenance note) and `vendor/three/three.module.min.js`
(already vendored ahead of need by `update-three-vendor.yml`).

## TL;DR

- Vendored today: **r158** (UMD global build, loaded via classic `<script>`).
- Upstream `three` on npm is currently at **r185** (checked 2026-08-15) — three.js
  dropped the UMD/global build (`build/three.min.js`) starting at **r161**
  (verified in a previous session by inspecting the real npm tarballs for r160
  and r161, not from changelog text).
- That means: no future version of Three.js can be loaded with a plain
  `<script src="three.min.js">` tag anymore. ES modules are not a nice-to-have,
  they are the only path forward once we move past r160.
- The one hard blocker is **`file://` support** for the standalone HTML
  release: Chromium refuses both `<script type="module">` and dynamic
  `import()` of `file:` URLs ("Cross origin requests are only supported for
  HTTP"). `blob:` URLs are exempt from that restriction, so the plan mirrors
  the existing `cleanmodels.js` WASM-under-`file://` trick: embed the module
  source as text, wrap it in a `Blob`, `import()` the blob URL.
- Everything else (25 classic script files, all reading the global `THREE`
  object) stays untouched. A single new loader file bridges ES-module Three.js
  back onto `window.THREE`.

---

## 1. Current state

| Surface | How Three.js loads today |
|---|---|
| GitHub Pages (`index.html`, HTTP) | `vendor/three/three.min.js` (r158, vendored), falls back to cdnjs if missing |
| Standalone HTML (`dist/index.html`, `file://`) | Same vendored file, inlined by `build.py`; no network needed |
| Tauri desktop app | `frontendDist` points at raw `viewer/` (see `nwn_mdl_viewer_tauri`); served over `http://ipc.localhost`, **not** literal `file://` — this matters, see §7 |

`build.py` parses the ordered list of `<script src="js/…">` tags between the
`<!-- NWN MDL Viewer — Module -->` marker and `</body>` (`extract_js_order()`)
and inlines all 25 files into one classic `<script>` block. Roughly half of
them touch the global `THREE` object directly: `scene.js`, `scene_build.js`,
`session.js`, `ui.js`, `loader.js`, `animation.js`, `emitter.js`, `parser.js`,
`textures.js`, `txi.js`, `wok.js`, `pwk.js`, `dwk.js`. None of them contain an
`import` statement anywhere — that's the surface this plan has to preserve.

`three.module.min.js` is **already** vendored (see `update-three-vendor.yml`
step 3 — "Phase-2 prep... NOT wired into index.html yet") specifically so this
migration doesn't need a separate download step later.

## 2. Why this is forced, not optional

Three.js's own migration guidance is to upgrade in ~10-release increments, and
the project already has an agreed incremental path:

```
r158 (current) → r160 (next, still ships UMD — drop-in, no loader changes)
              → first post-r160 release that drops the UMD build → ES modules required
```

r160 is a safe, boring step: same `<script src>` loading mechanism, no
architecture change. That step is tracked separately (see
`update-three-vendor.yml`, `workflow_dispatch` with `version: 0.160.0`) and is
**not** blocked on this document.

Everything from the first UMD-less release onward requires this plan.

## 3. The `file://` problem (the actual hard part)

Chromium (and by extension Tauri's WebView on some platforms) treats `file:`
as an opaque origin for module fetches — both of these fail under `file://`:

```html
<script type="module" src="vendor/three/three.module.min.js"></script>
```
```js
await import('./vendor/three/three.module.min.js');
```

`blob:` URLs do not have this restriction — the importing document's origin is
irrelevant, the module is fetched from the blob's internal data. This is the
same reasoning `cleanmodels.js` already uses for the WASM binary under
`file://` (Base64 string → decode → `WebAssembly.compile()`, never `fetch()`).

**Proposed mirror for JS modules:**

1. A generator (parallel to `scripts/generate_wasm_b64.sh` /
   `update-wasm.yml`'s Base64 step) produces `js/three_module_b64.js`
   containing `three.module.min.js`'s source as a JS string constant, e.g.
   `var THREE_MODULE_B64 = "...";`. Likely folded into
   `update-three-vendor.yml` as an extra step rather than a new workflow.
2. At runtime, `js/three-loader.js` detects the protocol
   (`window.location.protocol === 'file:'`, same check `cleanmodels.js`
   already does):
   - **HTTP(S) / Tauri:** `const THREE = await import('./vendor/three/three.module.min.js')`
   - **`file://`:** decode `THREE_MODULE_B64` → `new Blob([src], {type: 'text/javascript'})`
     → `URL.createObjectURL(blob)` → `await import(blobUrl)` → `URL.revokeObjectURL(blobUrl)`
3. Either path ends with `window.THREE = THREE;` — a namespace object from
   `import * as THREE from 'three'` has the exact same shape as the current
   global `THREE`, so no other file needs to change.

**Open technical risk, needs a throwaway proof-of-concept before committing
to the full rewrite:** confirm `import()` of a `blob:` module URL actually
resolves relative *nested* imports correctly (Three.js's ESM build is a
single bundled file with no sub-imports, so this should be moot — but verify
against the real vendored file, not assumption).

## 4. Sequencing problem: async loader vs. synchronous classic scripts

`scene.js` calls `new THREE.WebGLRenderer(...)` at top-level, at parse time —
not inside a function. `animation.js` calls `animate(0)` at the bottom of the
file, also at parse time. Every one of the 25 files assumes `THREE` already
exists the moment it starts executing. A `Promise`-based loader can't just be
dropped in as script #1 in the existing static list; the browser doesn't wait
for it.

**Plan:** replace the current static `<script src="js/…">` list in
`index.html` with a small `type="module"` bootstrap that:

1. `await`s `three-loader.js` until `window.THREE` is set.
2. Appends the 25 classic `<script>` tags **in the existing order**, one at a
   time, awaiting each `load` event before appending the next — the same
   sequential-script-loading pattern `cleanmodels.js`'s `_loadScript()`
   already uses, just looped over the existing list instead of one WASM
   fallback script.

The ordered file list itself doesn't need to be duplicated as a second source
of truth: `build.py`'s `extract_js_order()` already parses it from the
`<!-- NWN MDL Viewer — Module -->` marker block, so the same marker block
(now containing the bootstrap `<script type="module">` instead of 25 static
tags) stays the single place that list is defined, whether the caller is
`build.py` or the runtime bootstrap itself.

## 5. `build.py` impact

Today: read all 25 files → concatenate into one classic `<script>` block →
done. That still works for the standalone HTML case, **but** the concatenated
block must not execute until `THREE` is ready. Planned change: `build.py`
wraps the existing inlined block in a callback invoked by the loader
(`threeLoader.ready().then(() => { <existing inlined code> })`) instead of
relying on script-tag order. This is a `build.py` change only — no change to
any of the 25 source files' contents.

## 6. Tauri considerations

`tauri.conf.json`'s CSP is `script-src 'self' 'wasm-unsafe-eval'`. Two notes:

- Tauri's `frontendDist` serves the app over `http://ipc.localhost`
  (confirmed via `tauri.conf.json` → `connect-src 'self' ipc: http://ipc.localhost`),
  **not** literal `file://`. Static `import()` of a same-origin vendored file
  works there without the `blob:` workaround — Tauri only ever needs the
  "HTTP(S)" branch of the loader in §3, never the `file://` branch. That
  branch exists purely for the standalone single-file HTML release opened
  directly from disk.
- `'self'` already covers `vendor/three/three.module.min.js` since it's
  vendored, not CDN-fetched — no CSP changes needed.

## 7. Phased rollout

| Phase | Scope | Blocked on |
|---|---|---|
| 2a (done) | Vendor `three.module.min.js` ahead of need | — already shipped via `update-three-vendor.yml` |
| 2b | r158 → r160, UMD stays, zero loader changes | Independent of this doc — tracked via `workflow_dispatch` |
| 2c | Build `js/three-loader.js`, Base64/Blob generator, `build.py` callback wrap, `index.html` bootstrap rewrite | This plan, Tobias sign-off |
| 2d | Pin the target post-UMD version and cut over | 2c merged + verified on all 3 surfaces |

For 2d: upstream is currently ~25 releases past r161. Recommend landing on
the **first UMD-less release** (r161, or whatever is closest at
implementation time) rather than jumping straight to r185 — smaller diff,
matches the project's own "~10 releases per hop" convention, and keeps the
loader rewrite decoupled from unrelated breaking-change cleanup. Catching up
further can be its own later phase once the loading mechanism itself is
proven stable.

**Do not treat the r162–r185 breaking-changes checklist that already exists
in the `nwn-mdl-viewer-dev` skill file as current** — it predates this
research and upstream has moved a long way since. Re-fetch
`https://github.com/mrdoob/three.js/wiki/Migration-Guide` fresh at the start
of Phase 2d and re-derive the checklist against whichever version is
actually pinned.

## 8. Immediate safety rail (independent of everything above)

`update-three-vendor.yml`'s `workflow_dispatch.inputs.version` already
supports pinning, which is good — but its **scheduled weekly run** has no
version pin and no check for whether the downloaded tarball still contains
`build/three.min.js`. Once upstream is UMD-less (already true today for
"latest"), a routine cron run would silently vendor a broken file and break
GitHub Pages + the standalone HTML release the next time someone rebuilds,
with no error until a user's browser console shows `THREE is not defined`.

**Cheap fix, worth landing now, decoupled from Phase 2c:** add a check step
right after the tarball download that fails the job loudly if
`package/build/three.min.js` is absent, with a message pointing at this
document. Keeps automatic updates safe until the real loader lands.

## 9. Testing checklist (for Phase 2c/2d)

- [ ] GitHub Pages (HTTP): model loads, animations play, no console errors
- [ ] Standalone HTML opened via `file://` directly (double-click, not a
      local server): same, plus confirm the `blob:` import path is actually
      taken (not silently falling through to the HTTP path)
- [ ] Standalone HTML served via `python3 -m http.server` (regression check
      against the HTTP path)
- [ ] Tauri dev (`npm run tauri dev`)
- [ ] Tauri built bundle, all three platforms per `release.yml`'s matrix
- [ ] Hot-Reload texture watcher still works (touches `THREE.CanvasTexture`)
- [ ] Skinned mesh + danglymesh + emitter smoke test (heaviest `THREE.*` users)
- [ ] `build.py --watch` still rebuilds cleanly on file change

## 10. Rollback plan

Keep the r158 UMD vendor files in `vendor/three/` until 2d is verified on all
three surfaces in production, not just locally — revert is "restore the two
`<script>` tags in `index.html`, drop the bootstrap module," nothing about
the 25 downstream files needs to change either direction.

## 11. Open questions for Tobias

1. Generator for `js/three_module_b64.js`: new step inside
   `update-three-vendor.yml`, or a separate script mirroring
   `scripts/generate_wasm_b64.sh`?
2. Target version for 2d — first UMD-less release, or a specific later pin?
3. OK to spend a throwaway POC (not committed) confirming the `blob:` import
   trick before writing the real loader?

## Version history log

| Date | Vendored version | Notes |
|---|---|---|
| 2024 | r152 → r158 | Initial vendoring off CDN, see `vendor/README.md` |
| (pending) | r158 → r160 | Phase 2b, drop-in, tracked outside this doc |
| (pending) | r160 → first UMD-less release | Phase 2c/2d, this document |

## References

- Migration guide (always re-fetch, don't trust a cached copy):
  `https://github.com/mrdoob/three.js/wiki/Migration-Guide`
- `vendor/README.md` — vendoring rationale, hash verification steps
- `.github/workflows/update-three-vendor.yml` — the automated vendor pipeline
- `js/cleanmodels.js` — existing precedent for the `file://` Base64/Blob
  pattern this plan reuses
- `/mnt/skills/user/nwn-mdl-viewer-dev/SKILL.md` §"Three.js Version
  Strategy" — older internal notes, superseded in scope by this document for
  everything ES-module related
