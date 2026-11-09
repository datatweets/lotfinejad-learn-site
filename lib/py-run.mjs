// Runs one learner program in a FRESH namespace and reports what happened. Shared by the browser worker and by the importer
// (Node + the same Pyodide), so expected values for checks come from the very runtime learners use.
// input() is unavailable (stdin is empty: Python raises EOFError); output is capped.
export const OUTPUT_LIMIT = 20000;

// Plots: matplotlib draws with the Agg backend (no screen). plt.show() then only warns, so the warning is silenced; after the program,
// every open figure is sent back as a PNG data URL and closed, so the next run starts clean.
const PLOT_SETUP = "import os, warnings\nos.environ['MPLBACKEND'] = 'Agg'\nwarnings.filterwarnings('ignore', message='.*non-interactive.*')";
const PLOT_COLLECT = `
import sys, io, base64
_out = []
if 'matplotlib.pyplot' in sys.modules:
    _plt = sys.modules['matplotlib.pyplot']
    for _n in _plt.get_fignums()[:6]:
        _buf = io.BytesIO()
        _plt.figure(_n).savefig(_buf, format='png', dpi=100, bbox_inches='tight')
        _out.append('data:image/png;base64,' + base64.b64encode(_buf.getvalue()).decode())
    _plt.close('all')
_out
`;
export const MAX_IMAGE_CHARS = 400000;

export async function runPython(py, code, { exprs = [] } = {}) {
  py.runPython(PLOT_SETUP);
  let out = "", truncated = false;
  const sink = chunk => { if (out.length < OUTPUT_LIMIT) out += chunk + "\n"; else truncated = true; };
  py.setStdout({ batched: sink });
  py.setStderr({ batched: sink });
  py.setStdin({ stdin: () => null });
  const ns = py.globals.get("dict")();
  try {
    try { py.runPython(code, { globals: ns }); }
    catch (error) { closePlots(py); return { ok: false, stdout: out.slice(0, OUTPUT_LIMIT), truncated, error: cleanTraceback(String(error.message ?? error)), values: null, images: [] }; }
    const values = [];
    for (const expr of exprs) {
      try { values.push(py.runPython(`repr(eval(${JSON.stringify(expr)}))`, { globals: ns })); }
      catch (error) { values.push(`!!${(String(error.message ?? error).trim().split("\n").pop().split(":")[0] || "Error").slice(0, 60)}`); }
    }
    let images = [];
    try { images = py.runPython(PLOT_COLLECT, { globals: py.globals.get("dict")() }).toJs().filter(u => u.length <= MAX_IMAGE_CHARS); } catch { images = []; }
    return { ok: true, stdout: out.slice(0, OUTPUT_LIMIT), truncated, error: null, values, images };
  } finally { ns.destroy?.(); }
}
function closePlots(py) { try { py.runPython("import sys\nif 'matplotlib.pyplot' in sys.modules: sys.modules['matplotlib.pyplot'].close('all')"); } catch { /* none open */ } }

// Keep the part a learner needs (the user-code frames and the final message), drop Pyodide's internal frames.
function cleanTraceback(text) {
  const lines = text.trim().split("\n"), start = lines.findIndex(l => l.startsWith("Traceback"));
  const kept = lines.slice(Math.max(start, 0)).filter((l, i, a) => !/pyodide[\\/]_base|_pyodide[\\/]|File "\/lib\/python/.test(l) || i === a.length - 1);
  return kept.join("\n");
}
