// Runs learner SQL in an in-memory SQLite (WASM) inside a dedicated Web Worker, so the page can TERMINATE it when a query
// runs too long. The database is either the seed-pinned synthetic shop or a registered practice database loaded from /data/<name>.db
// (a private in-memory copy per worker); only single read-only SELECT/WITH statements run; results are capped. No network access is used after the engine files load. Never runs on the server.
import sqlite3InitModule from "/vendor/sqlite-wasm/sqlite3.mjs";
import { shopStatements } from "./shop-synth.mjs";
import { checkReadOnlySql } from "./sql-guard.mjs";

let sqlite3 = null, db = null;
const reply = (id, payload) => self.postMessage({ id, ...payload });

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "init") {
      sqlite3 = await sqlite3InitModule();
      db = new sqlite3.oo1.DB(":memory:", "c");
      const ds = data.dataset ?? { id: "shop-synth-v1", seed: data.seed };
      if (ds.id === "file-db") {
        if (!/^[a-z0-9_]{1,40}$/.test(ds.name)) return reply(id, { ok: false, code: "engine_error", message: "bad database name" });
        const response = await fetch(`/data/${ds.name}.db`);
        if (!response.ok) return reply(id, { ok: false, code: "engine_error", message: `database ${ds.name} not found` });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
        db.checkRc(sqlite3.capi.sqlite3_deserialize(db.pointer, "main", pointer, bytes.length, bytes.length, sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE));
        for (const statement of ds.setupSql ?? []) db.exec(statement); // authored CREATE TEMP VIEW statements only (validated at import)
      } else for (const statement of shopStatements(ds.seed)) db.exec(statement);
      db.exec("PRAGMA query_only = ON");
      return reply(id, { ok: true, version: sqlite3.version.libVersion });
    }
    if (type === "run") {
      const verdict = checkReadOnlySql(data.sql);
      if (!verdict.ok) return reply(id, { ok: false, code: verdict.code });
      const stmt = db.prepare(data.sql);
      try {
        if (!sqlite3.capi.sqlite3_stmt_readonly(stmt)) return reply(id, { ok: false, code: "not_select" });
        const columns = stmt.getColumnNames(), rows = []; let truncated = false;
        while (stmt.step()) { if (rows.length >= data.maxRows) { truncated = true; break; } rows.push(stmt.get([])); }
        return reply(id, { ok: true, columns, rows, truncated });
      } finally { stmt.finalize(); }
    }
  } catch (error) { reply(id, { ok: false, code: "sql_error", message: String(error?.message ?? error) }); }
};
