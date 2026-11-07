// Decides whether learner SQL may be run: exactly one SELECT/WITH statement. Comments and quoted text are ignored when
// looking for a second statement. (The worker additionally asks SQLite whether the prepared statement is read-only.)
export function checkReadOnlySql(sql) {
  if (typeof sql !== "string") return { ok: false, code: "empty" };
  let code = "", i = 0;
  while (i < sql.length) {
    const c = sql[i], two = sql.slice(i, i + 2);
    if (two === "--") { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end + 1; code += " "; }
    else if (two === "/*") { const end = sql.indexOf("*/", i + 2); if (end < 0) return { ok: false, code: "unterminated_comment" }; i = end + 2; code += " "; }
    else if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c; let j = i + 1;
      for (;;) {
        if (j >= sql.length) return { ok: false, code: "unterminated_string" };
        if (sql[j] === close) { if (close !== "]" && sql[j + 1] === close) { j += 2; continue; } break; }
        j++;
      }
      i = j + 1; code += " X ";
    } else { code += c; i++; }
  }
  const body = code.trim().replace(/;\s*$/, "").trim();
  if (!body) return { ok: false, code: "empty" };
  if (body.includes(";")) return { ok: false, code: "multiple" };
  if (!/^(select|with)\b/i.test(body)) return { ok: false, code: "not_select" };
  return { ok: true };
}
