# Pyodide (vendored at build time)

- Package: pyodide 314.0.7 (MPL-2.0; CPython is under the PSF licence).
- Copied unmodified from the npm package by scripts/vendor-pyodide.mjs; the binaries are gitignored and re-created on every build.
- Used only inside a terminable Web Worker (static/lib/py-worker.mjs), standard library only, network access removed before learner code runs.
- Integrity: see SHA256SUMS; a unit test verifies the copied files against it and the exact pinned version in package.json.
