import type { ApiEntry, Cheat, Kind, Schema, Snippet } from "./types";

/* Ported from "Frappe script board.html" (DATA section) with the v13 corrections from SPEC.md. */

export const BASEC = "name owner creation modified modified_by docstatus idx".split(" ");
export const CHILDC = BASEC.concat("parent parentfield parenttype".split(" "));
const cols = (s: string, base?: string[]) => (base || BASEC).concat(s.split(/\s+/).filter(Boolean));

/** Fallback schema (standard ERPNext fields only). The live schema from the server replaces it once synced. */
export const SCHEMA0: Schema = {
  "Sales Invoice": { cols: cols("title naming_series customer customer_name tax_id is_pos is_consolidated is_return is_debit_note company company_tax_id posting_date posting_time set_posting_time due_date po_no territory currency conversion_rate selling_price_list price_list_currency total_qty base_total base_net_total total net_total tax_category base_total_taxes_and_charges total_taxes_and_charges apply_discount_on base_discount_amount discount_amount base_grand_total base_rounding_adjustment base_rounded_total base_in_words grand_total rounding_adjustment rounded_total in_words total_advance outstanding_amount write_off_amount base_paid_amount paid_amount letter_head language status customer_group is_internal_customer debit_to party_account_currency is_opening remarks amount_eligible_for_commission commission_rate total_commission against_income_account amended_from return_against project cost_center") },
  "Sales Invoice Item": { cols: cols("item_code item_name description item_group qty uom rate amount base_rate base_amount net_rate net_amount base_net_rate base_net_amount income_account expense_account cost_center warehouse", CHILDC) },
  "Sales Taxes and Charges": { cols: cols("charge_type account_head description included_in_print_rate cost_center rate account_currency tax_amount total base_tax_amount base_total item_wise_tax_detail", CHILDC) },
  "Payment Schedule": { cols: cols("due_date invoice_portion discount payment_amount outstanding paid_amount discounted_amount base_payment_amount", CHILDC) },
  "Journal Entry": { cols: cols("title voucher_type naming_series posting_date company finance_book apply_tds total_amount total_amount_currency total_debit total_credit difference multi_currency is_opening cheque_no cheque_date user_remark remark bill_no bill_date due_date pay_to_recd_from mode_of_payment letter_head amended_from reversal_of") },
  "Journal Entry Account": { cols: cols("account account_type party_type party cost_center project account_currency exchange_rate debit_in_account_currency debit credit_in_account_currency credit reference_type reference_name reference_due_date is_advance user_remark against_account", CHILDC) },
  "GL Entry": { cols: cols("posting_date transaction_date account party_type party cost_center debit credit account_currency debit_in_account_currency credit_in_account_currency against against_voucher_type against_voucher voucher_type voucher_no remarks is_opening is_advance fiscal_year company finance_book is_cancelled project") },
  "Payment Entry": { cols: cols("naming_series payment_type posting_date company mode_of_payment party_type party party_name paid_from paid_to paid_amount received_amount total_allocated_amount unallocated_amount difference_amount reference_no reference_date status remarks cost_center amended_from") },
  "Payment Entry Reference": { cols: cols("reference_doctype reference_name due_date total_amount outstanding_amount allocated_amount exchange_rate", CHILDC) },
  "Customer": { cols: cols("customer_name customer_type customer_group territory tax_id default_currency disabled mobile_no email_id") },
};

// child tables of the fallback doctypes, in the same "Table → Child" form the live schema uses
const FALLBACK_TABLES: [string, string, string][] = [
  ["Sales Invoice", "items", "Sales Invoice Item"],
  ["Sales Invoice", "taxes", "Sales Taxes and Charges"],
  ["Sales Invoice", "payment_schedule", "Payment Schedule"],
  ["Journal Entry", "accounts", "Journal Entry Account"],
  ["Payment Entry", "references", "Payment Entry Reference"],
];
for (const [parent, field, child] of FALLBACK_TABLES) {
  const t = SCHEMA0[parent];
  if (!t.cols.includes(field)) t.cols.push(field);
  t.types = { ...t.types, [field]: "Table → " + child };
}

const NOT_V13 = "Not available in the v13 console. ";
const mkApi = (n: string, p: string | null, d: string, ins?: string | null, k?: Kind): ApiEntry => ({
  n,
  params: p === null ? null : p.split(",").map(s => s.trim()).filter(Boolean),
  doc: d,
  ins,
  kind: k || (p === null ? "prop" : "method"),
});

export const API: ApiEntry[] = [
  mkApi("log", "text", "Console output. In the System Console use log(text) instead of print(). It takes ONE value, so join with str(a) + \" \" + str(b)."),
  mkApi("json", null, "JSON helpers available in the console: json.dumps and json.loads.", null, "module"),
  mkApi("json.dumps", "obj, default=None, indent=None, sort_keys=False", "Serialize to a JSON string. Use json.dumps(rows, default=str) so dates and Decimals print.", "dumps($0, default=str)"),
  mkApi("json.loads", "s", "Parse a JSON string into dicts and lists."),
  mkApi("set_value", "doctype, name, field, value", "Write mode helper. Records a direct database change (frappe.db.set_value): skips validation, hooks and GL posting. Also accepts a dict: set_value(doctype, name, {field: value}). Nothing is written until you confirm the dry run."),
  mkApi("update_doc", "doctype, name, values, ignore_validate=False", "Write mode helper. Records a change that loads the document, updates the fields and calls save(), so validation runs unless ignore_validate=True. Nothing is written until you confirm the dry run."),
  mkApi("frappe.db", null, "Database helper. Reads: sql, get_value, exists, count.", null, "module"),
  mkApi("frappe.utils", null, "Number, date and string helpers: flt, cint, getdate, add_days...", null, "module"),
  mkApi("frappe.session", null, "Current session. Use frappe.session.user for the logged-in user."),
  mkApi("frappe.session.user", null, "Id (email) of the logged-in user."),
  mkApi("frappe.flags", null, "Per-request flags dictionary."),
  mkApi("frappe.db.sql", "query, values=None, as_dict=False", "Run a SQL query (MariaDB). On v13 the console only accepts queries that start with SELECT. Use %(name)s or %s placeholders with values. If you pass values, a literal % must be written %%. as_dict=True lets you read row.fieldname.", 'sql("""\n    SELECT $0\n""", as_dict=True)'),
  mkApi("frappe.db.sql_list", "query, values=None", NOT_V13 + "Run a query and return the first column as a flat list."),
  mkApi("frappe.db.get_value", "doctype, filters, fieldname='name', as_dict=False", "One value (or a tuple for several fields) from the first matching record. filters can be a name or a dict."),
  mkApi("frappe.db.get_single_value", "doctype, fieldname", "Read a field of a Single doctype (settings)."),
  mkApi("frappe.db.exists", "doctype, filters=None", "Returns the record name if it exists, otherwise None."),
  mkApi("frappe.db.count", "doctype, filters=None", "Number of records matching the filters."),
  mkApi("frappe.db.escape", "s", "Quote a value so it is safe to put inside SQL text."),
  mkApi("frappe.db.set_value", "doctype, name, fieldname, value=None, update_modified=True", "WRITES. Updates the table directly: no validation, no hooks, no GL posting. Avoid on submitted documents. In write mode use set_value(...) instead."),
  mkApi("frappe.db.commit", "", "WRITES. Saves every change made in this run."),
  mkApi("frappe.db.rollback", "", "Undo every uncommitted change made in this run."),
  mkApi("frappe.get_all", "doctype, filters=None, fields=None, order_by=None, limit_page_length=20, pluck=None", "List records, ignoring user permissions. The default limit is 20, pass limit_page_length=0 for all. filters: dict or [[field, op, value]].", 'get_all("$0", filters={}, fields=["name"], limit_page_length=0)'),
  mkApi("frappe.get_list", "doctype, filters=None, fields=None, order_by=None, limit_page_length=20", "Like get_all but respects user permissions."),
  mkApi("frappe.get_doc", "doctype, name=None", "Load a full document (with child tables) by name, or build a new one from a dict."),
  mkApi("frappe.get_cached_doc", "doctype, name=None", "Like get_doc but may serve a cached copy."),
  mkApi("frappe.get_last_doc", "doctype, filters=None, order_by='creation desc'", NOT_V13 + "The most recent document of a doctype."),
  mkApi("frappe.new_doc", "doctype", NOT_V13 + "Create an empty draft document in memory (not saved until insert())."),
  mkApi("frappe.copy_doc", "doc, ignore_no_copy=True", "Copy a document into a new unsaved draft."),
  mkApi("frappe.get_meta", "doctype", "Doctype metadata: fields, options, links."),
  mkApi("frappe.delete_doc", "doctype, name, force=0", "WRITES. Permanently deletes a document."),
  mkApi("frappe.msgprint", "msg, title=None, raise_exception=0, indicator=None", "Show a message dialog to the user."),
  mkApi("frappe.throw", "msg, exc=None, title=None", "Raise an error and stop the script."),
  mkApi("frappe.log_error", "message=None, title=None", "Write an entry to the Error Log."),
  mkApi("frappe.parse_json", "val", NOT_V13 + "Use json.loads(s) instead."),
  mkApi("frappe.as_json", "obj, indent=1", NOT_V13 + "Use json.dumps(obj, default=str) instead."),
  mkApi("frappe.enqueue", "method, queue='default', timeout=None, **kwargs", "Run a function in a background worker. Useful for long batches."),
  mkApi("frappe._dict", "*args, **kwargs", "Dictionary with attribute access: d.key as well as d['key'].", null, "class"),
  mkApi("frappe.utils.flt", "s, precision=None", "Convert to float. None and '' become 0.0."),
  mkApi("frappe.utils.cint", "s, default=0", "Convert to int safely."),
  mkApi("frappe.utils.cstr", "s", "Convert to string, None becomes ''."),
  mkApi("frappe.utils.getdate", "string_date=None", "Parse a date string into a date object."),
  mkApi("frappe.utils.nowdate", "", "Today as 'YYYY-MM-DD'."),
  mkApi("frappe.utils.today", "", "Today as 'YYYY-MM-DD'."),
  mkApi("frappe.utils.now", "", "Current datetime as a string."),
  mkApi("frappe.utils.now_datetime", "", "Current datetime object."),
  mkApi("frappe.utils.add_days", "date, days", "Date shifted by days (negative allowed)."),
  mkApi("frappe.utils.add_months", "date, months", "Date shifted by months."),
  mkApi("frappe.utils.date_diff", "end_date, start_date", "Whole days between two dates."),
  mkApi("frappe.utils.get_first_day", "dt, d_years=0, d_months=0", "First day of the month of dt."),
  mkApi("frappe.utils.get_last_day", "dt", "Last day of the month of dt."),
  mkApi("frappe.utils.fmt_money", "amount, precision=None, currency=None", "Format a number as money text."),
];

export const DOCAPI: ApiEntry[] = [
  mkApi("doc.insert", "ignore_permissions=None, ignore_mandatory=None", "WRITES. Insert as a new draft record."),
  mkApi("doc.save", "ignore_permissions=None, ignore_version=None", "WRITES. Save changes to a draft or an allowed-on-submit field."),
  mkApi("doc.submit", "", "WRITES. Submit the document (docstatus 1). Posts GL entries."),
  mkApi("doc.cancel", "", "WRITES. Cancel a submitted document (docstatus 2). Reverses GL entries."),
  mkApi("doc.delete", "", "WRITES. Delete the document."),
  mkApi("doc.db_set", "fieldname, value=None, update_modified=True, notify=False, commit=False", "WRITES one field straight to the database, skipping validation."),
  mkApi("doc.reload", "", "Re-read the document from the database."),
  mkApi("doc.append", "key, value=None", "Add a child row, for example doc.append('accounts', {...})."),
  mkApi("doc.get", "key, default=None", "Read a field or child table."),
  mkApi("doc.as_dict", "", "Plain dict copy of the document."),
  mkApi("doc.name", null, "Document id."),
  mkApi("doc.docstatus", null, "0 draft, 1 submitted, 2 cancelled."),
  mkApi("doc.doctype", null, "Doctype name."),
  mkApi("doc.flags", null, "Flags such as doc.flags.ignore_permissions = True."),
];

export const PYKW = new Set("and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False".split(" "));
export const PYBI = new Set("log len range sum min max abs round sorted set dict list tuple str int float bool enumerate zip any all isinstance type reversed map filter".split(" "));
export const SQLKW = new Set("select from where join left right inner outer on as and or not in is null like between group by order having limit offset distinct union all case when then else end asc desc exists count sum avg min max ifnull coalesce concat date_format curdate year month update set delete insert into values".split(" "));
export const SQLRESERVED = new Set("where join left right inner outer on group order having limit union set values select and or".split(" "));
export const SQLWORDS = ["SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "IS NULL", "IS NOT NULL", "LIKE", "BETWEEN", "JOIN", "LEFT JOIN", "INNER JOIN", "ON", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "DISTINCT", "AS", "ASC", "DESC", "UNION ALL", "CASE WHEN", "COUNT(", "SUM(", "AVG(", "MIN(", "MAX(", "IFNULL(", "COALESCE(", "CONCAT(", "DATE_FORMAT(", "CURDATE()"];

export const SNIPPETS: Snippet[] = [
  { label: "detect", doc: "Read-only check: join invoices with their adjustment journal entries and print the mismatches.", body: [
    'rows = frappe.db.sql("""',
    "    SELECT si.name AS invoice, si.grand_total,",
    "           si.adjustment_journal_entry AS je, je.total_debit",
    "    FROM `tabSales Invoice` si",
    "    JOIN `tabJournal Entry` je ON je.name = si.adjustment_journal_entry",
    "    WHERE si.docstatus = 1 AND je.docstatus = 1",
    '""", as_dict=True)',
    "",
    "bad = [r for r in rows if abs(frappe.utils.flt(r.grand_total) - frappe.utils.flt(r.total_debit)) > 0.01]",
    'log(str(len(rows)) + " checked, " + str(len(bad)) + " with discrepancy")',
    "for r in bad:",
    '    log(str(r.invoice) + " | " + str(r.je) + " | " + str(r.grand_total) + " | " + str(r.total_debit))$0'].join("\n") },
  { label: "fixloop", doc: "Dry-run loop over a fixed list of ids with per-record try/except and a log.", body: [
    "DRY_RUN = True  # keep True until the output looks right",
    "IDS = [$0]",
    "results = []",
    "for name in IDS:",
    "    try:",
    '        doc = frappe.get_doc("Journal Entry", name)',
    "        if doc.docstatus != 1:",
    '            results.append((name, "SKIPPED: not submitted"))',
    "            continue",
    "        if DRY_RUN:",
    '            results.append((name, "WOULD change, current debit " + str(doc.total_debit)))',
    "            continue",
    "        # TODO: the real change goes here",
    "    except Exception as e:",
    '        results.append((name, "ERROR: " + str(e)))',
    "for line in results:",
    "    log(str(line))"].join("\n") },
  { label: "asjson", doc: "Query and print the rows as JSON, ready for the Output panel.", body: ['rows = frappe.db.sql("""', "    SELECT $0", "    FROM `tab`", "    LIMIT 50", '""", as_dict=True)', "log(json.dumps(rows, default=str))"].join("\n") },
  { label: "sqlq", doc: "A frappe.db.sql query block.", body: ['rows = frappe.db.sql("""', "    SELECT $0", "    FROM `tab`", '""", as_dict=True)'].join("\n") },
  { label: "getall", doc: "frappe.get_all with no row limit.", body: 'rows = frappe.get_all("$0", filters={}, fields=["name"], limit_page_length=0)' },
  { label: "lookup", doc: "Build a name -> row lookup once instead of querying per row.", body: 'lookup = {j.name: j for j in frappe.get_all("Journal Entry", fields=["name", "total_debit"], limit_page_length=0)}$0' },
  { label: "chunks", doc: "Process a long id list in chunks.", body: ["CHUNK = 200", "ids = [$0]", "for i in range(0, len(ids), CHUNK):", "    chunk = ids[i:i + CHUNK]", "    log(str(len(chunk)))"].join("\n") },
  { label: "tryexcept", doc: "try/except that records the error instead of stopping.", body: ["try:", "    $0", "except Exception as e:", '    log("ERROR: " + str(e))'].join("\n") },
  { label: "writeloop", doc: "Write mode: record one set_value per row of a query. Review the plan in Changes before you commit.", body: [
    "rows = frappe.get_all(\"$0\", filters={}, fields=[\"name\"], limit_page_length=0)",
    "for r in rows:",
    '    set_value("DOCTYPE", r.name, "FIELDNAME", "VALUE")',
    'log(str(len(rows)) + " rows planned")'].join("\n") },
];

export const KINDCH: Record<string, string> = { method: "m", prop: "p", module: "M", class: "C", kw: "k", bi: "f", snip: "s", col: "c", tbl: "T", var: "v", alias: "a", field: "c", sql: "q" };
export const DICTM = new Set("get keys values items pop update copy setdefault clear".split(" "));
export const UTIL_NAMES = "flt cint cstr getdate nowdate today now_datetime add_days add_months date_diff get_first_day get_last_day fmt_money".split(" ");

/** Frappe names the v13 console sandbox does not expose, with the replacement to suggest. */
export const NOT_IN_V13: Record<string, string> = {
  "frappe.as_json": "json.dumps(x, default=str)",
  "frappe.parse_json": "json.loads(s)",
  "frappe.db.sql_list": "[r[0] for r in frappe.db.sql(...)]",
  "frappe.db.get_values": "frappe.get_all(...) or frappe.db.get_value(...)",
  "frappe.get_last_doc": "frappe.get_all(..., order_by=\"creation desc\", limit_page_length=1)",
  "frappe.get_cached_value": "frappe.db.get_value(...)",
  "frappe.new_doc": "frappe.get_doc({\"doctype\": ...})",
};

export const ACCOUNTING_DOCTYPES = ["Sales Invoice", "Purchase Invoice", "Journal Entry", "Payment Entry", "GL Entry", "Stock Ledger Entry"];

export const CHEATS: Cheat[] = [
  { g: "Get data", t: "Get one document by id", d: "Full document, including child tables.", c: 'doc = frappe.get_doc("DOCTYPE", "DOCNAME")\nlog(str(doc.FIELDNAME))' },
  { g: "Get data", t: "Get one field of an id", d: "Fastest way to read a single value.", c: 'value = frappe.db.get_value("DOCTYPE", "DOCNAME", "FIELDNAME")\nlog(str(value))' },
  { g: "Get data", t: "Get several fields of an id", d: "Returns a dict-like row.", c: 'row = frappe.db.get_value("DOCTYPE", "DOCNAME", ["FIELD1", "FIELD2"], as_dict=True)\nlog(str(row.FIELD1) + " " + str(row.FIELD2))' },
  { g: "Get data", t: "Get a list with a simple filter", d: "limit_page_length=0 means no limit (default is 20).", c: 'rows = frappe.get_all("DOCTYPE",\n    filters={"FIELDNAME": "VALUE"},\n    fields=["name", "FIELDNAME"],\n    limit_page_length=0)' },
  { g: "Get data", t: "Filter with operators", d: "[field, operator, value]. Operators: =, !=, >, <, >=, <=, like, in, not in, between.", c: 'rows = frappe.get_all("DOCTYPE",\n    filters=[["FIELDNAME", ">=", "VALUE"], ["STATUSFIELD", "in", ["A", "B"]]],\n    fields=["name"],\n    limit_page_length=0)' },
  { g: "Get data", t: "Check if an id exists", d: "Returns the name if found, otherwise None.", c: 'if frappe.db.exists("DOCTYPE", "DOCNAME"):\n    log("found")\nelse:\n    log("missing")' },
  { g: "Get data", t: "Count records", d: "", c: 'n = frappe.db.count("DOCTYPE", {"FIELDNAME": "VALUE"})\nlog(str(n))' },
  { g: "Get data", t: "Read child table rows", d: "Child tables are lists on the document.", c: 'doc = frappe.get_doc("DOCTYPE", "DOCNAME")\nfor row in doc.CHILDTABLE:\n    log(row.FIELDNAME)' },
  { g: "Get data", t: "Run a SQL query", d: "Use %(name)s placeholders and pass values as a dict.", c: 'rows = frappe.db.sql("""\n    SELECT name, FIELDNAME\n    FROM `tabDOCTYPE`\n    WHERE FIELDNAME = %(value)s\n""", {"value": "VALUE"}, as_dict=True)' },
  { g: "Get data", t: "Print rows as JSON", d: "Works on every version. The Output panel shows it as JSON or a table.", c: "log(json.dumps(rows, default=str))" },
  { g: "Write mode", w: 1, t: "Set one field directly", d: "Recorded, then written after you confirm the dry run. Skips validation, hooks and GL posting.", c: 'set_value("DOCTYPE", "DOCNAME", "FIELDNAME", "VALUE")' },
  { g: "Write mode", w: 1, t: "Set several fields directly", d: "Same as above with a dict of field: value.", c: 'set_value("DOCTYPE", "DOCNAME", {"FIELD1": "VALUE", "FIELD2": 0})' },
  { g: "Write mode", w: 1, t: "Update and save with validation", d: "Loads the document, updates the fields and saves it, so validation runs.", c: 'update_doc("DOCTYPE", "DOCNAME", {"FIELDNAME": "VALUE"})' },
  { g: "Write mode", w: 1, t: "Update and save, skip validation", d: "doc.flags.ignore_validate = True before save().", c: 'update_doc("DOCTYPE", "DOCNAME", {"FIELDNAME": "VALUE"}, ignore_validate=True)' },
  { g: "Write mode", w: 1, t: "Change every row of a query", d: "Press Dry run changes, review the Changes tab, then confirm.", c: 'rows = frappe.get_all("DOCTYPE", filters={"FIELDNAME": "VALUE"}, fields=["name"], limit_page_length=0)\nfor r in rows:\n    set_value("DOCTYPE", r.name, "FIELDNAME", "NEWVALUE")' },
  { g: "Set data", w: 1, t: "Set one field directly", d: "Skips validation and hooks. Avoid on submitted documents. For the real console only; Run refuses it.", c: 'frappe.db.set_value("DOCTYPE", "DOCNAME", "FIELDNAME", "VALUE")' },
  { g: "Set data", w: 1, t: "Change a field and save", d: "Runs validation. Works on drafts.", c: 'doc = frappe.get_doc("DOCTYPE", "DOCNAME")\ndoc.FIELDNAME = "VALUE"\ndoc.save()' },
  { g: "Set data", w: 1, t: "Create a new document", d: "Inserted as a draft until you submit it.", c: 'doc = frappe.get_doc({\n    "doctype": "DOCTYPE",\n    "FIELDNAME": "VALUE",\n})\ndoc.insert()' },
  { g: "Set data", w: 1, t: "Add a child row", d: "", c: 'doc = frappe.get_doc("DOCTYPE", "DOCNAME")\ndoc.append("CHILDTABLE", {\n    "FIELDNAME": "VALUE",\n})\ndoc.save()' },
  { g: "Set data", w: 1, t: "Submit / cancel", d: "Submit posts GL entries, cancel reverses them.", c: 'doc = frappe.get_doc("DOCTYPE", "DOCNAME")\ndoc.submit()   # or doc.cancel()' },
  { g: "Set data", w: 1, t: "Save the changes", d: "The console has a Commit checkbox too. Leave it off for test runs.", c: "frappe.db.commit()" },
  { g: "Python basics", t: "Variables and output", d: "", c: 'name = "VALUE"\ntotal = 100\nlog(name + " " + str(total))\nlog("Total is " + str(total))' },
  { g: "Python basics", t: "List (array)", d: "", c: 'ids = ["ID1", "ID2"]\nids.append("ID3")\nlog(str(len(ids)) + " " + ids[0])' },
  { g: "Python basics", t: "Dict (object)", d: "Use .get() so a missing key does not raise an error.", c: 'item = {"name": "VALUE", "total": 100}\nitem["status"] = "VALUE"\nlog(str(item.get("KEY", 0)))' },
  { g: "Python basics", t: "Loop", d: "Indentation (4 spaces) matters.", c: "for row in rows:\n    log(row.name)" },
  { g: "Python basics", t: "If / else", d: "", c: 'if row.FIELDNAME == "VALUE":\n    log("match")\nelif row.FIELDNAME is None:\n    log("empty")\nelse:\n    log("other")' },
  { g: "Python basics", t: "Filter a list", d: "Same idea as array.filter in JavaScript.", c: "matches = [r for r in rows if r.FIELDNAME > 0]" },
  { g: "Python basics", t: "Pick one field from every row", d: "Same idea as array.map.", c: "values = [r.FIELDNAME for r in rows]" },
  { g: "Python basics", t: "Lookup by key", d: "Build once, then read in O(1) instead of searching.", c: 'lookup = {r.name: r for r in rows}\nlog(str(lookup.get("DOCNAME")))' },
  { g: "Python basics", t: "Safe number math", d: "flt turns None and empty text into 0.0.", c: "diff = abs(frappe.utils.flt(a) - frappe.utils.flt(b))" },
  { g: "Python basics", t: "Try / except", d: "Keep going when one record fails.", c: 'try:\n    # code here\n    pass\nexcept Exception as e:\n    log("ERROR: " + str(e))' },
];

export const DEFAULT_SCRIPT = [
  "# Detect only. This script reads and prints, it never writes.",
  'rows = frappe.db.sql("""',
  "    SELECT si.name AS invoice,",
  "           si.posting_date,",
  "           si.grand_total,",
  "           si.adjustment_journal_entry AS je,",
  "           je.total_debit",
  "    FROM `tabSales Invoice` si",
  "    JOIN `tabJournal Entry` je ON je.name = si.adjustment_journal_entry",
  "    WHERE si.docstatus = 1",
  "      AND je.docstatus = 1",
  "      AND si.name LIKE %(prefix)s",
  "      AND si.posting_date <= %(date)s",
  '""", {"prefix": "SOA-%", "date": "2026-05-01"}, as_dict=True)',
  "",
  '# PLACEHOLDER RULE: replace with your real definition of "wrong"',
  "bad = [r for r in rows if abs(frappe.utils.flt(r.grand_total) - frappe.utils.flt(r.total_debit)) > 0.01]",
  "",
  'log(str(len(rows)) + " checked, " + str(len(bad)) + " with discrepancy")',
  "for r in bad:",
  '    log(str(r.invoice) + " | " + str(r.je) + " | " + str(r.grand_total) + " | " + str(r.total_debit))',
  "",
  "log(json.dumps([r.je for r in bad], default=str))",
  "",
].join("\n");
