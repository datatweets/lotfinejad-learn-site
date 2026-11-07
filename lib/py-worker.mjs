// Runs learner Python (Pyodide) inside a dedicated Web Worker so the page can TERMINATE it when a program runs too long.
// Standard library only. After the runtime has loaded, every network primitive is removed, so learner code cannot reach the
// network (the page's CSP forbids it as well). Never runs on the server.
import { loadPyodide } from "/vendor/pyodide/pyodide.mjs";
import { runPython } from "./py-run.mjs";

let py = null, initId = null;
const reply = (id, payload) => self.postMessage({ id, ...payload });
const PACKAGE_ALLOWLIST = new Set(["numpy", "scipy"]);
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
      py = await loadPyodide({ indexURL: "/vendor/pyodide/" });
      // Optional packages (numpy, scipy) are loaded from our own host BEFORE the network primitives are removed below.
      const wanted = Array.isArray(data.packages) ? data.packages.filter(n => PACKAGE_ALLOWLIST.has(n)) : [];
      if (wanted.length) {
        await py.loadPackage(wanted);
        // loadPackage can report a failed download without throwing; importing now turns that into an immediate init failure
        // (the page offers a retry) instead of a confusing ModuleNotFoundError in the learner's first program.
        py.runPython(wanted.map(n => `import ${n}`).join("\n"));
      }
      for (const name of REMOVED) { try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch { /* not present */ } }
      initId = null;
      return reply(id, { ok: true, version: py.version });
    }
    if (type === "run") return reply(id, await runPython(py, data.code, { exprs: data.exprs ?? [] }));
  } catch (error) { reply(id, { ok: false, code: "engine_error", message: String(error?.message ?? error) }); }
};
