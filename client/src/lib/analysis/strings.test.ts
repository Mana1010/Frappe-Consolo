import { describe, expect, it } from "vitest";
import { tokens } from "./guard";
import { analyze, ctxAt } from "./analyze";
import { pyCompletions } from "./complete";
import { stringCompletions } from "./strings";
import { SCHEMA0 } from "./data";
import { schemaFromLive } from "./schema";
import type { Schema } from "./types";

/** Completions with the caret at "|" (the marker is removed from the text). */
function at(src: string, schema: Schema = SCHEMA0, forced = false) {
  const caret = src.indexOf("|"), text = src.replace("|", ""), toks = tokens(text), c = ctxAt(toks, caret);
  if (!c || c.t !== "str") return null;
  return stringCompletions(text, caret, c.tok, toks, analyze(text, schema), schema, forced);
}
const labels = (src: string, schema?: Schema) => at(src, schema)?.items.map(i => i.label) ?? [];

const LIVE = schemaFromLive([
  { name: "Sales Invoice", istable: 0, issingle: 0, fields: [
    { f: "customer", t: "Link", o: "Customer" }, { f: "grand_total", t: "Currency" },
    { f: "policy_name", t: "Data" }, { f: "items", t: "Table", o: "Sales Invoice Item" }] },
  { name: "Sales Invoice Item", istable: 1, issingle: 0, fields: [{ f: "item_code", t: "Link", o: "Item" }, { f: "qty", t: "Float" }] },
  { name: "Insurance Policy", istable: 0, issingle: 0, fields: [{ f: "policy_no", t: "Data" }] },
  { name: "Accounts Settings", istable: 0, issingle: 1, fields: [{ f: "over_billing_allowance", t: "Currency" }] },
]);

describe("doctype names inside strings", () => {
  it("suggests doctypes for the first argument of frappe calls", () => {
    expect(labels('frappe.get_doc("Sal|')).toEqual(expect.arrayContaining(["Sales Invoice", "Sales Invoice Item"]));
    expect(labels('frappe.get_doc("Sal|')[0]).toBe("Sales Invoice");
    for (const call of ["frappe.get_all", "frappe.get_list", "frappe.db.get_value", "frappe.db.exists", "frappe.db.count", "set_value", "update_doc"])
      expect(labels(call + '("Jour|')).toContain("Journal Entry");
  });

  it("keeps spaces in the query and replaces the whole string content", () => {
    const r = at('doc = frappe.get_doc("Sales In|")')!;
    expect(r.items[0].label).toBe("Sales Invoice");
    expect(r.start).toBe('doc = frappe.get_doc("'.length);
  });

  it("uses the synced schema, including custom doctypes", () => {
    expect(labels('frappe.get_all("Insur|', LIVE)).toEqual(["Insurance Policy"]);
    expect(labels('frappe.get_all("Insur|')).toEqual([]); // not in the fallback
  });

  it("only offers singles to get_single_value", () => {
    expect(labels('frappe.db.get_single_value("|', LIVE)).toEqual(["Accounts Settings"]);
  });

  it("completes the doctype key of a get_doc dict", () => {
    expect(labels('frappe.get_doc({"doctype": "Custo|"})')).toEqual(["Customer"]);
  });

  it("stays quiet in strings that are not doctype slots", () => {
    expect(at('log("Sal|')).toBeNull();
    expect(at('frappe.get_doc("Sales Invoice", "SOA-|')).toBeNull(); // document names are not in the schema
    expect(at('x = "Sal|')).toBeNull();
  });
});

describe("field names inside strings", () => {
  it("completes get_value fieldnames for the doctype in the first argument", () => {
    expect(labels('frappe.db.get_value("Sales Invoice", "SOA-1", "grand|")')[0]).toBe("grand_total");
    expect(labels('frappe.db.get_value("Sales Invoice", "SOA-1", ["customer", "grand|"])')[0]).toBe("grand_total");
  });

  it("completes get_all fields, filters and order_by", () => {
    expect(labels('frappe.get_all("Sales Invoice", fields=["name", "posting_d|"])')[0]).toBe("posting_date");
    expect(labels('frappe.get_all("Sales Invoice", filters={"docst|": 1})')[0]).toBe("docstatus");
    expect(labels('frappe.get_all("Sales Invoice", filters=[["outstanding|", ">", 0]])')[0]).toBe("outstanding_amount");
    expect(labels('frappe.get_all("Sales Invoice", order_by="posting_date desc, grand|")')[0]).toBe("grand_total");
  });

  it("does not complete filter values", () => {
    expect(at('frappe.get_all("Sales Invoice", filters={"status": "Pa|"})')).toBeNull();
    expect(at('frappe.get_all("Sales Invoice", filters=[["status", "=", "Pa|"]])')).toBeNull();
  });

  it("includes custom fields from the synced schema", () => {
    expect(labels('frappe.db.get_value("Sales Invoice", "SOA-1", "polic|")', LIVE)).toEqual(["policy_name"]);
  });

  it("completes set_value / update_doc fields", () => {
    expect(labels('set_value("Sales Invoice", "SOA-1", "remar|", "x")')[0]).toBe("remarks");
    expect(labels('update_doc("Customer", "C1", {"tax_|": "1"})')[0]).toBe("tax_id");
  });

  it("completes doc.get() and doc.append() from the variable's doctype", () => {
    const pre = 'doc = frappe.get_doc("Sales Invoice", "SOA-1")\n';
    expect(labels(pre + 'doc.get("grand|")')[0]).toBe("grand_total");
    expect(labels(pre + 'doc.append("|")')).toEqual(expect.arrayContaining(["items", "taxes"]));
    expect(labels(pre + 'doc.append("|")')).not.toContain("customer");
  });
});

describe("doc. and child-row members", () => {
  const an = (t: string, s: Schema = SCHEMA0) => analyze(t, s);

  it("adds the doctype's fields after doc.", () => {
    const text = 'doc = frappe.get_doc("Sales Invoice", "SOA-1")\n';
    const r = pyCompletions("doc.grand", text, an(text), false, SCHEMA0)!;
    expect(r.items[0].label).toBe("grand_total");
    const all = pyCompletions("doc.", text, an(text), true, SCHEMA0)!.items.map(i => i.label);
    expect(all).toEqual(expect.arrayContaining(["save", "name", "customer"]));
  });

  it("knows child rows from for loops over table fields", () => {
    const text = 'doc = frappe.get_doc("Sales Invoice", "SOA-1")\nfor it in doc.items:\n    it.';
    expect(an(text).docTypes.it).toBe("Sales Invoice Item");
    const r = pyCompletions("    it.item_", text, an(text), false, SCHEMA0)!;
    expect(r.items[0].label).toBe("item_code");
    expect(r.items.some(i => i.label === "save")).toBe(false);
  });

  it("follows doc.get(\"items\") and live child tables", () => {
    const text = 'si = frappe.get_doc("Sales Invoice", x)\nfor row in si.get("items"):\n    row.';
    expect(an(text, LIVE).docTypes.row).toBe("Sales Invoice Item");
    expect(pyCompletions("    row.q", text, an(text, LIVE), false, LIVE)!.items[0].label).toBe("qty");
  });

  it("expands get_all(fields=[\"*\"]) to every column", () => {
    const text = 'rows = frappe.get_all("Customer", fields=["*"])\n';
    expect(an(text).rows.rows).toEqual(expect.arrayContaining(["customer_name", "tax_id", "name"]));
  });
});
