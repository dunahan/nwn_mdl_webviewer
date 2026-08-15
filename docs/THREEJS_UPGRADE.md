# Three.js Upgrade Notes

## Version history

| Version | Date | Notes |
|---------|------|-------|
| r152    | —    | pre-vendoring, loaded via CDN only |
| r158    | 2024 | first vendored version, see `vendor/README.md` |
| r160    | 2026 | last revision shipping the classic/UMD build (`three.min.js`) |

## r158 → r160 (done / trivial)

No code changes needed. r160's own migration guide (r159→r160) contains
only internal fixes (BufferGeometry, texture filtering, degenerate
triangle handling) — nothing this project touches. Bump via the
`update-three-vendor.yml` workflow (`workflow_dispatch`, version
`0.160.0`), or hand-patch `vendor/three/three.version` plus the two
`three.min.js` references in `index.html` (vendored path stays the same;
only the CDN-fallback version number and its `integrity=` SRI hash
change).

Verified directly against the real npm tarballs (not just registry
metadata, which can be stale): r160 still ships `build/three.js` and
`build/three.min.js`, only printing a deprecation warning. r161 is where
they're actually removed.

## r161+ (not yet done — required once we bump past r160)

r161 removes `build/three.js` / `build/three.min.js` from the npm
package — only `three.module.js` / `three.module.min.js` / `three.cjs`
remain. The ~20 `js/*.js` files stay classic scripts sharing one global
scope on purpose (rewriting them as ES modules would break every
cross-file reference, e.g. `wokGroup` from `wok.js` read via `typeof` in
`session.js`) — so we don't convert them, we bridge them:

1. **`js/three-loader.js`** (`type="module"`) imports Three and sets
   `window.THREE`. Same Base64+Blob-URL pattern as `cleanmodels.js` for
   `file://` mode (module imports of local files are blocked there — same
   constraint that already forced the WASM loader's Base64 path).

   ```js
   // js/three-loader.js
   const isLocal = location.protocol === 'file:' || location.protocol === 'content:';

   async function loadThree() {
     if (!isLocal) {
       try {
         return await import('./vendor/three/three.module.min.js');
       } catch (e) {
         console.warn('[three-loader] vendor module missing, falling back to CDN', e);
         return await import('https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js');
       }
     }
     // file:// blocks module fetch() of local files — same constraint as
     // the WASM loader in cleanmodels.js. Reuse the identical pattern.
     if (typeof THREE_MODULE_B64 === 'undefined') {
       await new Promise((resolve, reject) => {
         const s = document.createElement('script');
         s.src = 'vendor/three/three_module_b64.js';
         s.onload = resolve;
         s.onerror = reject;
         document.head.appendChild(s);
       });
     }
     const bin = atob(THREE_MODULE_B64);
     const bytes = new Uint8Array(bin.length);
     for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
     const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
     const mod = await import(blobUrl);
     URL.revokeObjectURL(blobUrl);
     return mod;
   }

   window.THREE = await loadThree();
   ```

2. **`index.html`**: replace the `three.min.js` + CDN-fallback snippet
   with `<script type="module" src="js/three-loader.js"></script>`, and
   append `defer` to every `<script src="js/...">` tag — *after* `src=`,
   not before, so build.py's script-order regex
   (`<script\s+src="js/([^"]+\.js)"`) keeps matching.

   Why this is enough on its own (no manual sequential script injection
   needed): per the HTML spec, `type="module"` scripts without `async`
   and classic scripts with `defer` share one execution queue, in
   document order. So `window.THREE` is guaranteed to be set before the
   first `defer`-ed classic script runs.

3. **Tauri needs no change.** It never hits the Blob/`file://` branch —
   it serves the frontend via its own custom scheme (or
   `http://localhost` in the dev server), never `file:`/`content:`, so it
   always takes the plain `import()` branch. The `blob:` CSP question
   (`script-src` in `src-tauri/tauri.conf.json`) is therefore moot in
   practice — verify on the first real test before widening the CSP
   pre-emptively.

4. **`build.py`**: the one real snag. `defer` has no effect on inline
   `<script>` elements per spec, but that's exactly what build.py
   produces today (`f'<script>\n{js_combined}\n</script>'`). Fix: keep
   the combined script classic (not a module — cross-file globals must
   stay intact), but reference it via a `data:` URI `src` instead of
   inlining it, so `defer` actually applies:

   ```diff
   -    replacement = f'<script>\n{js_combined}\n</script>'
   +    b64 = base64.b64encode(js_combined.encode('utf-8')).decode('ascii')
   +    replacement = f'<script defer src="data:text/javascript;charset=utf-8;base64,{b64}"></script>'
   ```

   Keep `charset=utf-8` — otherwise the Unicode box-drawing characters
   and arrows in the file header comments (`═══`, `→`, `✕`, …) get
   mangled. Also add one `shutil.copy` for `js/three-loader.js` into
   `dist/js/`, mirroring the existing favicon-copy step.

5. **`update-three-vendor.yml`**: add a Base64-encoding step for
   `three.module.min.js` → `vendor/three/three_module_b64.js`, mirroring
   the WASM Base64 step already in `update-wasm.yml`. Delete the
   `Patch CDN fallback in index.html` step entirely — dynamic `import()`
   has no `integrity=` equivalent, so there is nothing left to patch.
   Net effect: one fewer workflow step than today.

### Explicitly out of scope for this migration

- Converting any of the ~20 `js/*.js` files into ES modules themselves.
- Any change to Tauri's CSP unless testing actually shows it's needed.
- Keeping SRI/`integrity=` on the CDN fallback — not supported for
  dynamic `import()`, and this fallback is rarely hit in practice.
