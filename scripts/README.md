# scripts/

Helper scripts for local development. The scripts are supplements to the CI workflow [`update-wasm.yml`](../.github/workflows/update-wasm.yml) and intended for situations where you don't want to wait for GitHub Actions — for example, when locally testing a new WASM version.

---

## generate_wasm_b64.sh

Generates `js/cleanmodels_wasm.js` from a local `cleanmodels.wasm`.

The file `cleanmodels_wasm.js` contains the WASM binary as a Base64-encoded JavaScript variable (`CM_WASM_B64`) and is used by the viewer in `file://` mode, since browsers don't allow `fetch()` calls there.

**Requirements:** `bash`, `base64` (available on Linux & macOS)

```bash
# Call from the repo root:
./scripts/generate_wasm_b64.sh

# Or with an explicit path to the WASM file:
./scripts/generate_wasm_b64.sh ./wasm/Cleanmodels.wasm
```

**Output:**
