import { describe, expect, it } from "vitest";
import { checkIndent, formatIndent } from "./indent";
import { CHEATS, SNIPPETS } from "./data";

const lines = (...l: string[]) => l.join("\n");
const errors = (t: string) => checkIndent(t).filter(d => d.level === "error");
const fmt = (t: string) => formatIndent(t).text;

describe("checkIndent: valid code has no problems", () => {
  it("accepts nested blocks, branches, comments and blank lines", () => {
    const ok = lines(
      "rows = frappe.get_all(\"Customer\", fields=[\"name\"])",
      "for r in rows:",
      "    # a comment",
      "    if r.name:",
      "        log(r.name)",
      "",
      "    elif r.name is None:",
      "        pass",
      "    else:",
      "        log(\"x\")",
      "try:",
      "    x = 1",
      "except Exception as e:",
      "    log(str(e))",
      "finally:",
      "    log(\"done\")",
      "def f(a):",
      "    return a",
    );
    expect(checkIndent(ok)).toEqual([]);
  });

  it("ignores SQL indentation inside triple quotes and bracket continuations", () => {
    const ok = lines(
      "rows = frappe.db.sql(\"\"\"",
      "    SELECT name",
      "  FROM `tabCustomer`",
      "\"\"\", as_dict=True)",
      "x = frappe.get_all(\"Customer\",",
      "        filters={\"disabled\": 0},",
      "  fields=[\"name\"])",
      "if x:",
      "    log(x)",
    );
    expect(checkIndent(ok)).toEqual([]);
  });

  it("finds nothing wrong in the built-in snippets and cheatsheet", () => {
    for (const s of SNIPPETS) expect(errors(s.body.replace("$0", "x")), s.label).toEqual([]);
    for (const c of CHEATS) expect(errors(c.c), c.t).toEqual([]);
  });

  it("treats a one-line if as a complete statement", () => {
    expect(checkIndent("if x: log(1)\nlog(2)")).toEqual([]);
  });
});

describe("checkIndent: problems", () => {
  it("unexpected indent", () => {
    const d = errors("x = 1\n    y = 2");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ line: 2 });
    expect(d[0].msg).toMatch(/Unexpected indent/);
  });

  it("missing indented block", () => {
    expect(errors("for r in rows:\nlog(r)")[0].msg).toMatch(/Expected an indented block after line 1/);
    expect(errors("for r in rows:")[0].msg).toMatch(/no indented block/);
  });

  it("dedent that matches no outer level", () => {
    expect(errors("if a:\n        x = 1\n    y = 2")[0].msg).toMatch(/doesn't line up/);
  });

  it("else written at the body's level", () => {
    expect(errors("if a:\n    x = 1\n    else:\n    y = 2")[0].msg).toMatch(/'else' must line up/);
  });

  it("mixed tabs and spaces, and non-multiple-of-4 indents", () => {
    expect(checkIndent("if a:\n\tx = 1\nif b:\n    y = 2").some(d => /Tabs and spaces/.test(d.msg))).toBe(true);
    expect(checkIndent("if a:\n  x = 1").some(d => d.level === "info" && /4 spaces/.test(d.msg))).toBe(true);
  });
});

describe("formatIndent", () => {
  it("re-indents to 4 spaces per level and converts tabs", () => {
    const messy = lines("for r in rows:", "  if r.ok:", "\t\tlog(r)", "  else:", "     log(\"no\")");
    expect(fmt(messy)).toBe(lines("for r in rows:", "    if r.ok:", "        log(r)", "    else:", "        log(\"no\")"));
  });

  it("fixes unexpected indents and missing body indents", () => {
    expect(fmt("x = 1\n    y = 2")).toBe("x = 1\ny = 2");
    expect(fmt("for r in rows:\nlog(r)")).toBe("for r in rows:\n    log(r)");
  });

  it("snaps an unmatched dedent and lines up a misplaced else", () => {
    expect(fmt("if a:\n        x = 1\n    y = 2")).toBe("if a:\n    x = 1\ny = 2");
    expect(fmt("if a:\n    x = 1\n    else:\n    y = 2")).toBe("if a:\n    x = 1\nelse:\n    y = 2");
  });

  it("does not pull an else into an empty block", () => {
    expect(fmt("if a:\nelse:\n    y = 2")).toBe("if a:\nelse:\n    y = 2");
  });

  it("never changes string contents, and moves continuation lines with their statement", () => {
    const src = lines(
      "if True:",
      "  rows = frappe.db.sql(\"\"\"",
      "      SELECT name   ",
      "  FROM `tabCustomer`",
      "\"\"\", as_dict=True)",
      "  x = frappe.get_all(\"Customer\",",
      "      fields=[\"name\"])   ",
    );
    expect(fmt(src)).toBe(lines(
      "if True:",
      "    rows = frappe.db.sql(\"\"\"",
      "      SELECT name   ",
      "  FROM `tabCustomer`",
      "\"\"\", as_dict=True)",
      "    x = frappe.get_all(\"Customer\",",
      "        fields=[\"name\"])",
    ));
  });

  it("keeps the line count, trims trailing spaces, and is stable when run twice", () => {
    const src = "for r in rows:   \n  log(r)  \n\n\n  # end   \nlog(1)";
    const once = fmt(src);
    expect(once.split("\n")).toHaveLength(src.split("\n").length);
    expect(once).toBe("for r in rows:\n    log(r)\n\n\n    # end\nlog(1)");
    expect(fmt(once)).toBe(once);
    expect(checkIndent(once).filter(d => d.level !== "info")).toEqual([]);
  });

  it("reports how many lines changed", () => {
    expect(formatIndent("x = 1\ny = 2").changed).toBe(0);
    expect(formatIndent("if a:\n  x = 1").changed).toBe(1);
  });
});
