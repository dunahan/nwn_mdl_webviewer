# wasm/

Contains the WebAssembly binary of the [cleanmodels](https://github.com/plenarius/cleanmodels) tool
and associated metadata files. The contents of this directory are kept up to date
**automatically** by the CI workflow — manual changes will be overwritten on the next update.

---

## Files

| File | Description |
|------|-------------|
| `cleanmodels.wasm` | WebAssembly binary (upstream release) |
| `cleanmodels.version` | Version tag of the installed release, e.g. `v1.4.2` |
| `cleanmodels.wasm.sha256` | SHA-256 checksum of the binary |

> `js/cleanmodels_wasm.js` lives in the `js/` directory, but logically belongs here:
> it is the Base64-encoded version of the binary for `file://` operation
> and is always updated simultaneously with `cleanmodels.wasm`.

---

## Why two formats?

The viewer supports two operating modes:

**HTTP / GitHub Pages**
`cleanmodels.wasm` is loaded via `fetch()` — the browser allows this
because a real HTTP origin is present. Fast, no overhead.

**Local (`file://`)**
Browsers block `fetch()` on `file://` origins for security reasons.
Instead, `js/cleanmodels_wasm.js` is included as a regular `<script>` tag,
which provides the binary as a Base64 string in the variable `CM_WASM_B64`.
`cleanmodels.js` automatically selects the mode based on
`window.location.protocol`.

---

## Update mechanism

Updates are applied by the workflow
[`.github/workflows/update-wasm.yml`](../.github/workflows/update-wasm.yml):
