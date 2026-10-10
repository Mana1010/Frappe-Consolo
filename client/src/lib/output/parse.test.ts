import { describe, expect, it } from "vitest";
import { formatLoose, hlJson, parseAll, parseOut, prettyJson, toTable } from "./parse";

describe("parseOut", () => {
  it("parses a JSON line", () => {
    expect(parseOut('[{"name": "SINV-1", "grand_total": 10.5}]')).toEqual([{ v: [{ name: "SINV-1", grand_total: 10.5 }] }]);
  });

  it("parses Python repr with Decimal, datetime.date and None", () => {
    const raw = "[{'name': 'SINV-1', 'total': Decimal('12.50'), 'posting_date': datetime.date(2026, 5, 1), 'remarks': None, 'is_pos': True}]";
    expect(parseOut(raw)).toEqual([{ v: [{ name: "SINV-1", total: 12.5, posting_date: "2026-05-01", remarks: null, is_pos: true }] }]);
  });

  it("keeps text around objects as text segments", () => {
    const raw = "3 checked, 1 with discrepancy\n{'a': 1}\nSINV-1 | JV-1 | 10 | 12\n";
    expect(parseOut(raw)).toEqual([{ t: "3 checked, 1 with discrepancy" }, { v: { a: 1 } }, { t: "SINV-1 | JV-1 | 10 | 12" }]);
  });

  it("leaves tracebacks and unbalanced text alone", () => {
    const raw = 'Traceback (most recent call last):\n  File "<serverscript>", line 3\n(unclosed';
    expect(parseOut(raw)).toEqual([{ t: raw }]);
  });
});

describe("parseAll / prettyJson / toTable", () => {
  it("parses datetimes and _dict", () => {
    expect(parseAll("{'d': datetime.datetime(2026, 1, 2, 3, 4, 5)}, frappe._dict(a=1)")).toEqual([{ d: "2026-01-02 03:04:05" }, { a: 1 }]);
  });

  it("prettyJson keeps short primitive containers on one line", () => {
    expect(prettyJson({ a: 1, b: "x" })).toBe('{"a": 1, "b": "x"}');
    expect(prettyJson([{ a: 1 }, { a: 2, b: [1, 2] }])).toBe('[\n  {"a": 1},\n  {\n    "a": 2,\n    "b": [1, 2]\n  }\n]');
  });

  it("toTable aligns columns and prints None", () => {
    expect(toTable([{ name: "A", n: 1 }, { name: "BB", n: null }])).toBe("name | n\n-----+-----\nA    | 1\nBB   | None");
  });

  it("formatLoose handles modes and errors", () => {
    expect(formatLoose("not an object")).toBeNull();
    expect(formatLoose("{'a': None}", "compact")).toEqual({ text: '{"a":null}', count: 1 });
    expect(formatLoose("{'a': ")).toHaveProperty("error");
  });

  it("hlJson tags keys, strings, numbers and literals", () => {
    const parts = hlJson('{"a": "x", "b": 1, "c": null}');
    expect(parts.filter(p => p.cls).map(p => p.cls)).toEqual(["jk", "js", "jk", "jn", "jk", "jl"]);
  });
});
