# SQLite WASM (vendored)

- Package: @sqlite.org/sqlite-wasm 3.54.1-build1 (Apache-2.0); SQLite itself is public domain.
- Copied unmodified from the npm package by scripts/vendor-sqlite-wasm.mjs (`dist/index.mjs` is served as `sqlite3.mjs`).
- Used only inside a terminable Web Worker (static/lib/sql-worker.mjs), in-memory, read-only SELECT/WITH.
- Integrity: see SHA256SUMS; a unit test checks these files against it and the exact pinned version in package.json.
