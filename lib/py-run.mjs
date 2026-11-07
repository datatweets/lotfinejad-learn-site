// Runs one learner program in a FRESH namespace and reports what happened. Shared by the browser worker and by the importer
// (Node + the same Pyodide), so expected values for checks come from the very runtime learners use.
// input() is unavailable (stdin is empty: Python raises EOFError); output is capped.
export const OUTPUT_LIMIT = 20000;

export async function runPython(py, code, { exprs = [] } = {}) {
  let out = "", truncated = false;
  const sink = chunk => { if (out.length < OUTPUT_LIMIT) out += chunk + "\n"; else truncated = true; };
  py.setStdout({ batched: sink });
  py.setStderr({ batched: sink });
  py.setStdin({ stdin: () => null });
  const ns = py.globals.get("dict")();
  try {
    try { py.runPython(code, { globals: ns }); }
    catch (error) { return { ok: false, stdout: out.slice(0, OUTPUT_LIMIT), truncated, error: cleanTraceback(String(error.message ?? error)), values: null }; }
    const values = [];
    for (const expr of exprs) {
      try { values.push(py.runPython(`repr(eval(${JSON.stringify(expr)}))`, { globals: ns })); }
      catch (error) { values.push(`!!${(String(error.message ?? error).trim().split("\n").pop().split(":")[0] || "Error").slice(0, 60)}`); }
    }
    return { ok: true, stdout: out.slice(0, OUTPUT_LIMIT), truncated, error: null, values };
  } finally { ns.destroy?.(); }
}

// Keep the part a learner needs (the user-code frames and the final message), drop Pyodide's internal frames.
function cleanTraceback(text) {
  const lines = text.trim().split("\n"), start = lines.findIndex(l => l.startsWith("Traceback"));
  const kept = lines.slice(Math.max(start, 0)).filter((l, i, a) => !/pyodide[\\/]_base|_pyodide[\\/]|File "\/lib\/python/.test(l) || i === a.length - 1);
  return kept.join("\n");
}
