import { readOnlyScan, writeModeScan } from './guard';

// Cases carried over from the HTML board's guard tests plus the v13 / write-mode additions.
const READ_ALLOW: Record<string, string> = {
  default_detect:
    'rows = frappe.db.sql("""\n    SELECT si.name AS invoice, REPLACE(si.title, "a", "b") t, INSERT(si.name, 1, 2, "x") i\n    FROM `tabSales Invoice` si\n    WHERE si.name LIKE %(p)s AND si.remarks = \'update x set y\'\n""", {"p": "SOA-%"}, as_dict=True)\nbad = [r for r in rows if abs(frappe.utils.flt(r.grand_total)) > 0.01]\nlog(str(len(rows)) + " checked")\nfor r in bad:\n    log(r.invoice)\nlog(json.dumps(rows, default=str))',
  get_all:
    'rows = frappe.get_all("Sales Invoice", filters={"docstatus": 1}, fields=["name"], limit_page_length=0)\nnames = [r.name for r in rows]\nnames.sort()\nnames.insert(0, "x")\nlog(", ".join(names))',
  get_doc_read:
    'doc = frappe.get_doc("Sales Invoice", "SOA-1")\nfor it in doc.items:\n    log(it.item_code)\nd = doc.as_dict()\nlog(frappe.session.user.lower())\nlog(str(frappe.db.get_value("Customer", "C1", ["name", "tax_id"], as_dict=True)))',
  with_cte:
    'rows = frappe.db.sql("""WITH x AS (SELECT name FROM `tabCustomer`) SELECT * FROM x""", as_dict=True)\nlog(rows)',
  local_assign:
    'doc = frappe.get_doc("Sales Invoice", "SOA-1")\ndoc.remarks = "only in memory"\nlookup = {}\nlookup.update({"a": 1})\nlog(str(lookup.get("a")))',
  json_loads: 'x = json.loads("[1, 2]")\nlog(json.dumps(x))\nd = _dict(a=1)',
};
const READ_BLOCK: Record<string, string> = {
  save: 'doc = frappe.get_doc("Sales Invoice", "SOA-1")\ndoc.save()',
  submit_chain: 'frappe.get_doc("Journal Entry", "JV-1").submit()',
  insert_doc:
    'frappe.get_doc({"doctype": "Note", "title": "x"}).insert(ignore_permissions=True)',
  insert_noargs: 'd = frappe.new_doc("Note")\nd.insert()',
  alias_commit: 'c = frappe.db.commit\nc()',
  alias_db: 'db = frappe.db\ndb.set_value("Customer", "C1", "tax_id", "1")',
  alias_frappe: 'f = frappe\nf.delete_doc("Customer", "C1")',
  alias_json: 'j = json\nlog(j)',
  method_ref: 'doc = frappe.get_doc("Customer", "C1")\ns = doc.save\ns()',
  set_value: 'frappe.db.set_value("Customer", "C1", "tax_id", "1")',
  db_set: 'frappe.get_doc("Customer", "C1").db_set("tax_id", "1")',
  delete_doc: 'frappe.delete_doc("Customer", "C1")',
  enqueue: 'frappe.enqueue("x.y")',
  getattr: 'getattr(frappe.db, "com" + "mit")()',
  dunder: 'x = ().__class__',
  imports: 'import os\nfrom frappe import db',
  sql_update: 'frappe.db.sql("""UPDATE `tabCustomer` SET tax_id = 1""")',
  sql_stacked: 'frappe.db.sql("""SELECT 1; DELETE FROM `tabCustomer`""")',
  sql_var: 'q = "SELECT 1"\nfrappe.db.sql(q)',
  sql_concat:
    'frappe.db.sql("SELECT name FROM `tabCustomer` WHERE name = \'" + x + "\'")',
  sql_format: 'frappe.db.sql("""SELECT {0}""".format(x))',
  sql_for_update:
    'frappe.db.sql("""SELECT name FROM `tabCustomer` FOR UPDATE""")',
  sql_into_outfile:
    'frappe.db.sql("""SELECT * FROM `tabUser` INTO OUTFILE \'/tmp/x\'""")',
  sql_with_delete:
    'frappe.db.sql("""WITH x AS (SELECT 1) DELETE FROM `tabCustomer`""")',
  sql_sleep: 'frappe.db.sql("""SELECT SLEEP(100)""")',
  assign_frappe_attr: 'frappe.session.user = "Administrator"',
  rename: 'frappe.rename_doc("Customer", "a", "b")',
  sendmail: 'frappe.sendmail(recipients=["a@b.c"])',
  client_call:
    'frappe.call("frappe.client.delete", doctype="Customer", name="C1")',
  cancel_on_row:
    'for r in rows:\n    frappe.get_doc("Sales Invoice", r.name).cancel()',
  qb_update: 'frappe.qb.update("tabCustomer").set("x", 1).run()',
};
const WRITE_ALLOW: Record<string, string> = {
  set_value_single: 'set_value("Sales Invoice", "SOA-1", "remarks", "fixed")',
  set_value_dict:
    'for r in rows:\n    set_value("Journal Entry", r.je, {"user_remark": "x", "cheque_no": "1"})',
  update_doc:
    'update_doc("Customer", "C1", {"tax_id": "123"}, ignore_validate=True)',
  mixed_reads:
    'rows = frappe.db.sql("""SELECT name FROM `tabCustomer`""", as_dict=True)\nfor r in rows:\n    set_value("Customer", r.name, "disabled", 1)\nlog(str(len(rows)))',
};
const WRITE_BLOCK: Record<string, string> = {
  direct_set_value: 'frappe.db.set_value("Customer", "C1", "tax_id", "1")',
  direct_save: 'd = frappe.get_doc("Customer", "C1")\nd.save()',
  commit: 'frappe.db.commit()',
  rollback: 'frappe.db.rollback()',
  reserved: 'fsb_plan.append({})',
  redefine: 'def set_value(a, b, c, d):\n    pass',
  reassign: 'set_value = None',
  alias_helper: 'f = set_value\nf("Customer", "C1", "x", 1)',
  sql_update: 'frappe.db.sql("""UPDATE `tabCustomer` SET tax_id = 1""")',
};

const each = (o: Record<string, string>) => Object.entries(o);

describe('readOnlyScan', () => {
  it.each(each(READ_ALLOW))('allows %s', (_, code) => {
    expect(readOnlyScan(code)).toEqual([]);
  });
  it.each(each(READ_BLOCK))('blocks %s', (_, code) => {
    expect(readOnlyScan(code).length).toBeGreaterThan(0);
  });
  // bare unknown calls are harmless in read mode (NameError on the server)
  it.each(each(WRITE_ALLOW))('does not block helper call %s', (_, code) => {
    expect(readOnlyScan(code)).toEqual([]);
  });
  it('reports the SQL line inside a multi-line query', () => {
    const hits = readOnlyScan(
      'x = 1\nfrappe.db.sql("""\nSELECT 1\nFROM `tabUser`\nFOR UPDATE\n""")',
    );
    expect(hits).toEqual([{ line: 5, what: 'SQL FOR UPDATE (not a read)' }]);
  });
});

describe('writeModeScan', () => {
  it.each(each(WRITE_ALLOW))('allows %s', (_, code) => {
    expect(writeModeScan(code)).toEqual([]);
  });
  it.each(each(WRITE_BLOCK))('blocks %s', (_, code) => {
    expect(writeModeScan(code).length).toBeGreaterThan(0);
  });
  it('hints at the helpers for direct writes', () => {
    expect(
      writeModeScan('frappe.db.set_value("C", "1", "x", 1)')[0].what,
    ).toMatch(/In write mode use set_value\(\.\.\.\) or update_doc/);
  });
  it('explains reserved fsb_ names', () => {
    expect(writeModeScan('fsb_plan.append({})')[0].what).toBe(
      'names starting with fsb_ are reserved',
    );
  });
  it('covers every case', () => {
    const n = [READ_ALLOW, READ_BLOCK, WRITE_ALLOW, WRITE_BLOCK].reduce(
      (a, o) => a + Object.keys(o).length,
      0,
    );
    expect(n).toBe(50);
  });
});
