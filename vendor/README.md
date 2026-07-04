# Vendored Dependencies

Self-hosted third-party assets, replacing the previous CDN links in
`index.html` (`cdnjs.cloudflare.com`, `fonts.googleapis.com`,
`fonts.gstatic.com`). Motivation: enables a strict Tauri CSP (no
third-party `script-src`/`style-src`/`font-src`) and offline use — see
`TAURI_INTEGRATION_NOTES.md` (Phase 4) in the `nwn_mdl_viewer_tauri` repo
for the full reasoning.

## `three/three.min.js`

- Source: npm `three@0.152.0`, `build/three.min.js` (same version the
  CDN link previously pinned).
- **Verified byte-identical** to the previously CDN-hosted file: SHA-512
  of this file matches the `integrity="sha512-..."` attribute that was on
  the old `<script>` tag exactly
  (`Xr/WOAkCSWjhjwU5imbX1t2vZA4mDHqQJkuXOgzWH28GNXC9BfzuO54z3Byhb1xYGedSGlDMqFaoAI6DtOtC2g==`).
  Re-verify after any future version bump:
  ```bash
  openssl dgst -sha512 -binary vendor/three/three.min.js | openssl base64 -A
  ```
- License: MIT — see `three/LICENSE`.

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
