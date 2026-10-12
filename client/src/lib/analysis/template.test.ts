import { describe, expect, it } from "vitest";
import { doctypeTemplate } from "./template";
import { SCHEMA0 } from "./data";
import { schemaFromLive } from "./schema";

describe("doctypeTemplate", () => {
  it("lists every field with a null value and keeps the doctype name", () => {
    const t = doctypeTemplate(SCHEMA0, "Customer");
    expect(t.doctype).toBe("Customer");
    expect(t).toMatchObject({ name: null, customer_name: null, tax_id: null });
    expect(Object.values(t).filter(v => v !== null)).toEqual(["Customer"]);
  });

  it("turns child tables into a one-row list of the child's empty fields", () => {
    const t = doctypeTemplate(SCHEMA0, "Sales Invoice");
    expect(Array.isArray(t.items)).toBe(true);
    expect((t.items as Record<string, unknown>[])[0]).toMatchObject({ doctype: "Sales Invoice Item", item_code: null, qty: null, parent: null });
  });

  it("works with the synced schema, custom fields included, and unknown doctypes", () => {
    const live = schemaFromLive([
      { name: "Insurance Policy", istable: 0, issingle: 0, fields: [{ f: "policy_no", t: "Data" }, { f: "covers", t: "Table", o: "Policy Cover" }] },
      { name: "Policy Cover", istable: 1, issingle: 0, fields: [{ f: "peril", t: "Data" }] },
    ]);
    const t = doctypeTemplate(live, "Insurance Policy");
    expect(t.policy_no).toBeNull();
    expect((t.covers as Record<string, unknown>[])[0]).toMatchObject({ peril: null });
    expect(doctypeTemplate(live, "Nope")).toEqual({ doctype: "Nope" });
  });
});
