# Vendored Dependencies

Self-hosted third-party assets, replacing the previous CDN links in
`index.html` (`cdnjs.cloudflare.com`, `fonts.googleapis.com`,
`fonts.gstatic.com`). Motivation: enables a strict Tauri CSP (no
third-party `script-src`/`style-src`/`font-src`) and offline use — see
`TAURI_INTEGRATION_NOTES.md` (Phase 4) in the `nwn_mdl_viewer_tauri` repo
for the full reasoning.

## `three/three.min.js` + `three/three.module.min.js`

- Source: npm `three@0.160.0`, `build/three.min.js` (classic/UMD build,
  used directly by `index.html` today) and `build/three.module.min.js`
  (ES module build, vendored ahead of need for the r161+ migration — see
  `docs/THREEJS_UPGRADE.md`).
- `three.min.js` is r160's **last** classic build. r161 removes it from
  the npm package entirely — verified against the real npm tarballs
  (not just registry metadata, which can list stale/inaccurate file
  lists). No code changes are needed until we actually bump past r160.
- **Verified byte-identical** to the CDN-hosted file used as fallback in
  `index.html`: SHA-512 of this file matches the `integrity="sha512-..."`
  attribute on the `<script>` tag exactly
  (`vnmn/Qqn6aG0POAc9mIGzjq0IybrvxJXYDafNvp9JSnDGxeF3pbkSqLvf+YGd5ku63pT7sa/jxHn7/d0mU8+tA==`).
  Re-verify after any future version bump:
  ```bash
  openssl dgst -sha512 -binary vendor/three/three.min.js | openssl base64 -A
  ```
- License: MIT — see `three/LICENSE`.
- Version history: r152 → r158 (2024) → r160 (2026). See
  `docs/THREEJS_UPGRADE.md` and the `update-three-vendor.yml` workflow run
  history for provenance.

## `fonts/`

- Source: npm `@fontsource/cinzel@5.2.8` and
  `@fontsource/share-tech-mono@5.2.7`.
- Only the **latin** subset (matches `lang/` — currently en/de only) and
  only the weights actually used in `css/viewer.css` (Cinzel 400+600,
  Share Tech Mono's only weight, 400). Not a full mirror of the fontsource
  package — deliberately trimmed to keep the vendored footprint small.
- License: SIL Open Font License 1.1 — see `fonts/LICENSE-cinzel` and
  `fonts/LICENSE-share-tech-mono`.
- If a future translation needs non-Latin glyphs (e.g. Cyrillic, Greek):
  re-run `npm pack @fontsource/<font>` and pull in the matching
  `<subset>-<weight>.css` + `files/` entries, extending
  `fonts/fonts.css` accordingly.

## Updating

Both are npm packages purely for convenience as a trustworthy,
version-pinned download source — the app itself has no npm/bundler step
and doesn't `import` these; `index.html` references the vendored files
directly via `<script src="vendor/...">` / `<link href="vendor/...">`.
To update, `npm pack` the new version into a scratch directory, copy the
relevant files here, and re-verify the Three.js hash if you want to
confirm it still matches upstream's CDN build (optional once you trust
npm as the source of truth going forward — the hash-matching exercise
above was a one-time trust-establishing step for the initial migration
off the CDN).

For Three.js specifically, prefer triggering the `update-three-vendor.yml`
GitHub Actions workflow (`workflow_dispatch`, pin the target version) over
a manual `npm pack` — it downloads, hashes, and patches `index.html`
automatically. See `docs/THREEJS_UPGRADE.md` for the current pinned
version and the r161+ migration plan.
