// Runs learner Python (Pyodide) inside a dedicated Web Worker so the page can TERMINATE it when a program runs too long.
// Standard library only. After the runtime has loaded, every network primitive is removed, so learner code cannot reach the
// network (the page's CSP forbids it as well). Never runs on the server.
import { loadPyodide } from "/vendor/pyodide/pyodide.mjs";
import { runPython } from "./py-run.mjs";

let py = null, initId = null;
const reply = (id, payload) => self.postMessage({ id, ...payload });
const PACKAGE_ALLOWLIST = new Set(["numpy", "scipy", "pandas", "matplotlib"]);

// One-time download: runtime and package files are kept in the browser's Cache API (cache-first), so a learner downloads them
// once per browser, not on every visit and not every ten minutes like ordinary HTTP caching on a static host. Only our own
// /vendor/pyodide/ files are stored. The cache name carries the pinned version, so a new Pyodide release starts a fresh cache.
const CACHE_NAME = "learn-pyodide-314.0.7";
async function installCachingFetch() {
  if (typeof caches === "undefined") return;
  let cache; try { cache = await caches.open(CACHE_NAME); for (const k of await caches.keys()) if (k.startsWith("learn-pyodide-") && k !== CACHE_NAME) await caches.delete(k); } catch { return; }
  const network = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, self.location.href); // Pyodide passes URL objects as well as strings
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/vendor/pyodide/") || (init?.method ?? "GET") !== "GET") return network(input, init);
    try { const hit = await cache.match(url.pathname); if (hit) return hit; } catch { /* fall through to the network */ }
    const response = await network(input, init);
    if (response.ok) { try { await cache.put(url.pathname, response.clone()); } catch { /* quota: just do not cache */ } }
    return response;
  };
}
const REMOVED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "WebTransport"];

// If the runtime files cannot be fetched, Pyodide logs the failure and raises an UNHANDLED rejection but never settles loadPyodide().
// Turn that into an immediate failure reply, so the page shows its fallback at once instead of waiting for the init timeout.
const failInit = reason => { if (initId !== null && !py) { const id = initId; initId = null; reply(id, { ok: false, code: "engine_error", message: String(reason?.message ?? reason) }); } };
self.addEventListener("unhandledrejection", event => failInit(event.reason));
self.addEventListener("error", event => failInit(event.message));

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "init") {
      initId = id;
      await installCachingFetch();
      py = await loadPyodide({ indexURL: "/vendor/pyodide/" });
      // Optional packages (numpy, scipy) are loaded from our own host BEFORE the network primitives are removed below.
      const wanted = Array.isArray(data.packages) ? data.packages.filter(n => PACKAGE_ALLOWLIST.has(n)) : [];
      if (wanted.length) {
        await py.loadPackage(wanted);
        // loadPackage can report a failed download without throwing; importing now turns that into an immediate init failure
        // (the page offers a retry) instead of a confusing ModuleNotFoundError in the learner's first program.
        py.runPython(wanted.flatMap(n => n === "matplotlib" ? ["import os", "os.environ['MPLBACKEND'] = 'Agg'", "import matplotlib", "import matplotlib.pyplot"] : [`import ${n}`, ...(n === "scipy" ? ["import scipy.stats"] : [])]).join("\n")); // scipy.stats is slow to import: do it here, under the generous load budget, not inside the learner's timed run
      }
      // Data files for the lesson (small CSVs from our own host) are written into the working folder before the network is cut.
      const files = Array.isArray(data.files) ? data.files.filter(n => /^[a-z0-9_]{1,40}\.csv$/.test(n)) : [];
      for (const name of files) {
        const response = await self.fetch(`/data/py/${name}`);
        if (!response.ok) throw new Error(`data file ${name} could not be loaded (${response.status})`);
        py.FS.writeFile(name, new Uint8Array(await response.arrayBuffer()));
      }
      for (const name of REMOVED) { try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch { /* not present */ } }
      initId = null;
      return reply(id, { ok: true, version: py.version });
    }
    if (type === "run") return reply(id, await runPython(py, data.code, { exprs: data.exprs ?? [] }));
  } catch (error) { reply(id, { ok: false, code: "engine_error", message: String(error?.message ?? error) }); }
};
