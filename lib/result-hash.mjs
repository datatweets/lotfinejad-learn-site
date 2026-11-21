// Canonical result-set hash shared by the browser SQL workbench and the importer. The learner's rows are reduced to the
// compared columns (in the order listed), sorted unless order matters, and hashed. The server only ever compares hashes:
// the solution SQL is never sent to the browser before its reveal rule allows it.
const norm = v => (v === null || v === undefined ? null : typeof v === "bigint" ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : typeof v === "boolean" ? Number(v) : v);

// result = { columns: string[], rows: any[][] }. Returns null when a compared column is missing.
export function canonicalResult(result, compareColumns, orderMatters) {
  const idx = compareColumns.map(c => result.columns.indexOf(c));
  if (idx.some(i => i < 0)) return null;
  let rows = result.rows.map(r => idx.map(i => norm(r[i])));
  if (!orderMatters) rows = rows.map(r => JSON.stringify(r)).sort().map(s => JSON.parse(s));
  return JSON.stringify(rows);
}

export async function resultHash(result, compareColumns, orderMatters) {
  const canonical = canonicalResult(result, compareColumns, orderMatters);
  if (canonical === null) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`v1:${compareColumns.join(",")}:${orderMatters ? "o" : "u"}:${canonical}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Python checks. mode "stdout": the program's printed text (line endings and trailing whitespace normalised).
// mode "exprs": the repr() of each listed expression evaluated after the program ran (an exception becomes "!!<ExceptionName>").
export const normalizeStdout = text => text.replace(/\r\n?/g, "\n").split("\n").map(l => l.replace(/[ \t]+$/, "")).join("\n").replace(/\s+$/, "");
export async function pythonHash(mode, payload) {
  const text = mode === "stdout" ? normalizeStdout(payload) : JSON.stringify(payload);
  if (typeof text !== "string") return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`py1:${mode}:${text}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
