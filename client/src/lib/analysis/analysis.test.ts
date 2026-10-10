import { describe, expect, it } from "vitest";
import { tokens } from "./guard";
import { analyze, callAt, ctxAt, resolveApi } from "./analyze";
import { pyCompletions, sqlCompletions } from "./complete";
import { runChecks } from "./checks";
import { SCHEMA0 } from "./data";
import { credErr, normUrl, splitToken } from "./validate";

const an = (t: string) => analyze(t, SCHEMA0);

describe("completions", () => {
  it("lists frappe.db members after frappe.db.", () => {
    const r = pyCompletions("rows = frappe.db.", "rows = frappe.db.", an(""), false);
    expect(r).not.toBeNull();
    const labels = r!.items.map(i => i.label);
    expect(labels).toEqual(expect.arrayContaining(["sql", "get_value", "exists", "count"]));
    expect(r!.start).toBe("rows = frappe.db.".length);
    expect(r!.items.find(i => i.label === "sql")!.insert).toContain("$0");
  });

  it("filters members by the typed prefix", () => {
    const r = pyCompletions("frappe.db.get_v", "", an(""), false)!;
    expect(r.items[0].label).toBe("get_value");
    expect(r.start).toBe("frappe.db.".length);
  });

  it("offers json.dumps and the write helpers", () => {
    expect(pyCompletions("json.", "", an(""), false)!.items.map(i => i.label)).toEqual(expect.arrayContaining(["dumps", "loads"]));
    expect(pyCompletions("set_v", "", an(""), false)!.items[0].label).toBe("set_value");
  });

  it("completes columns of an aliased table after si.", () => {
    const full = "\n    SELECT si.gr\n    FROM `tabSales Invoice` si\n";
    const all = sqlCompletions("\n    SELECT si.", full, SCHEMA0, false, "")!;
    expect(all.items.map(i => i.label)).toEqual(expect.arrayContaining(["name", "posting_date"]));
    expect(all.items.every(i => i.kind === "col" && i.detail === "Sales Invoice")).toBe(true);
    const before = "\n    SELECT si.gr";
    const r = sqlCompletions(before, full, SCHEMA0, false, "")!;
    expect(r.items.map(i => i.label)).toEqual(expect.arrayContaining(["grand_total", "base_grand_total"]));
    expect(r.items[0].label).toBe("grand_total");
    expect(r.start).toBe(before.length - 2);
  });

  it("completes table names after FROM and inside backticks", () => {
    const r = sqlCompletions("SELECT name FROM Sales", "SELECT name FROM Sales", SCHEMA0, false, "")!;
    expect(r.items[0].insert).toMatch(/^`tabSales/);
    const b = sqlCompletions("FROM `tabJour", "FROM `tabJour", SCHEMA0, false, "")!;
    expect(b.items[0].label).toBe("tabJournal Entry");
    expect(b.items[0].insert).toBe("tabJournal Entry`");
  });

  it("completes query row fields for loop variables", () => {
    const text = 'rows = frappe.db.sql("""SELECT name, grand_total AS gt FROM `tabSales Invoice`""", as_dict=True)\nfor r in rows:\n    r.';
    const r = pyCompletions("    r.", text, an(text), false)!;
    expect(r.items.map(i => i.label)).toEqual(["name", "gt"]);
  });
});

describe("context helpers", () => {
  it("ctxAt detects triple strings", () => {
    const t = 'x = """SELECT 1"""';
    expect(ctxAt(tokens(t), 9)?.t).toBe("tstr");
    expect(ctxAt(tokens(t), 2)).toBeNull();
  });
  it("callAt + resolveApi give signature help", () => {
    const t = 'frappe.db.get_value("Customer", ';
    const c = callAt(t, t.length, tokens(t))!;
    expect(c).toEqual({ name: "frappe.db.get_value", arg: 1 });
    expect(resolveApi(c.name)?.params?.[1]).toBe("filters");
    expect(resolveApi("update_doc")?.params).toContain("ignore_validate=False");
  });
});

describe("runChecks", () => {
  const check = (t: string, opts = {}) => runChecks(t, tokens(t), SCHEMA0, an(t), opts);

  it("flags print() as an error", () => {
    const d = check('print("hi")');
    expect(d.some(x => x.level === "error" && /print\(\)/.test(x.msg) && x.line === 1)).toBe(true);
  });

  it("flags unclosed brackets", () => {
    const d = check("x = foo(1, [2, 3]\nlog(x)");
    expect(d.some(x => x.level === "error" && x.msg === "'(' is never closed" && x.line === 1)).toBe(true);
    expect(check("x = 1)").some(x => x.msg === "Unmatched ')'")).toBe(true);
  });

  it("warns about frappe.as_json on v13 and suggests json.dumps", () => {
    const d = check("log(frappe.as_json(rows))", { version: "13.58.22" });
    expect(d.some(x => /json\.dumps/.test(x.msg))).toBe(true);
    expect(check("log(frappe.as_json(rows))", { version: "15.1.0" }).some(x => /does not exist/.test(x.msg))).toBe(false);
  });

  it("reports guard hits, with write-mode scan when asked", () => {
    expect(check("frappe.db.commit()").some(x => x.msg.startsWith("Run blocks this (read-only)"))).toBe(true);
    const w = check('set_value("Customer", "C1", "disabled", 1)\nfsb_plan = []', { writeMode: true, writable: true });
    expect(w.some(x => /fsb_ are reserved/.test(x.msg))).toBe(true);
    expect(w.some(x => /set_value/.test(x.msg))).toBe(false);
  });

  it("warns about WITH on v13 but not for prose strings", () => {
    expect(check('rows = frappe.db.sql("""WITH t AS (SELECT 1) SELECT * FROM t""")', { version: "13.58.22" }).some(x => /WITH is not allowed/.test(x.msg))).toBe(true);
    expect(check('log(str(n) + " with discrepancy")', { version: "13.58.22" })).toEqual([]);
  });

  it("is clean for a simple read", () => {
    expect(check('rows = frappe.get_all("Customer", fields=["name"])\nlog(json.dumps(rows, default=str))')).toEqual([]);
  });
});

describe("connection form validation", () => {
  it("normUrl", () => {
    expect(normUrl("localhost:8000")).toEqual({ url: "http://localhost:8000" });
    expect(normUrl("erp.example.com/app/home")).toEqual({ url: "https://erp.example.com" });
    expect(normUrl("")).toHaveProperty("err");
    expect(normUrl("ftp://x")).toEqual({ err: "Use an http:// or https:// address." });
  });
  it("splitToken", () => {
    expect(splitToken("token abc123def456ghi:sec123sec456sec")).toEqual({ key: "abc123def456ghi", secret: "sec123sec456sec" });
    expect(splitToken("Authorization: token k1234567890:s1234567890")).toEqual({ key: "k1234567890", secret: "s1234567890" });
    expect(splitToken("justakey12345")).toBeNull();
  });
  it("credErr", () => {
    expect(credErr("", "key")).toBe("Enter the API key.");
    expect(credErr("abc def", "key")).toMatch(/spaces/);
    expect(credErr("abc:def", "secret")).toMatch(/':'/);
    expect(credErr("abc-def-ghij", "key")).toMatch(/letters and digits/);
    expect(credErr("short", "key")).toMatch(/this one has 5/);
    expect(credErr("a1b2c3d4e5f6g7h", "key")).toBe("");
  });
});
