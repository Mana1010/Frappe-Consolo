"use client";

import { useUi } from "@/lib/store/ui";
import { DialogBar, Modal } from "@/components/ui/Modal";

export function HelpDialog() {
  const close = useUi.getState().closeDialog;
  return (
    <Modal title="How this board works" onClose={close} wide>
      <ul>
        <li><b>Run</b> (Ctrl+Enter) sends the script to the board&apos;s server, which forwards it to the site&apos;s System Console with Commit off, so every change is rolled back. Your browser never talks to Frappe and never sees the API secret, so the site needs <b>no allow_cors</b>.</li>
        <li>Run is <b>query only</b>. The server checks the script against a read-only allowlist before sending it: frappe.db.sql with one literal SELECT query, get_value, get_all, get_list, get_doc, exists, count, frappe.utils, json.dumps/json.loads and plain Python. Anything else (save, submit, insert, set_value, delete_doc, commit, aliases like <code>c = frappe.db.commit</code>, getattr, imports) is refused and never reaches the site. The Checks panel shows the same rules while you type.</li>
        <li>Print results with <code>log(json.dumps(rows, default=str))</code> or <code>log(rows)</code>. The Output panel turns JSON and Python output (single quotes, None, Decimal(...), datetime.date(...)) into clean JSON, or a table with the Table button. Drag the dock&apos;s top edge to make it taller.</li>
        <li><b>Write mode</b> (signed in, connection marked Writable in Manage connections): call <code>set_value(doctype, name, field, value)</code> (direct database write, skips validation, hooks and GL posting) or <code>update_doc(doctype, name, {"{"}field: value{"}"}, ignore_validate=False)</code> (load, update, save with validation). These only <i>record</i> changes. <b>Dry run changes</b> runs the script with Commit off and lists every planned change with its before and after value in the Changes tab. Type the number of changes (or COMMIT) to confirm: the server re-runs the same code with Commit on, checks that the plan is identical, and only then writes everything in one block. If anything differs or fails, nothing is written. Every run is kept in History.</li>
        <li>Suggestions use your site&apos;s live schema after <b>Sync schema</b> (Schema tab), and a small built-in ERPNext list before that. Inside a SQL string, tables and columns complete (<code>si.</code> lists the columns of the aliased table). After <code>rows = frappe.db.sql(...)</code>, typing <code>r.</code> inside <code>for r in rows</code> lists the selected columns.</li>
        <li><b>Notes pad</b> is a floating, draggable scratch area. Paste an object or list and it is formatted automatically. Signed in, it syncs to your account; otherwise it stays in this browser.</li>
        <li>Without an account you can use <b>temporary connections</b> and Run. Sign in to save connections (URL, key and secret are encrypted and never shown again), scripts, run history and notes.</li>
      </ul>
      <p><b>Frappe v13 notes.</b> The System Console sandbox has no <code>print</code>, <code>frappe.as_json</code>, <code>frappe.parse_json</code>, <code>frappe.db.sql_list</code>, <code>frappe.db.get_values</code>, <code>frappe.get_last_doc</code>, <code>frappe.get_cached_value</code> or <code>frappe.new_doc</code>; use <code>log</code>, <code>json.dumps</code> and <code>json.loads</code>. <code>frappe.db.sql</code> only accepts queries that start with SELECT (no WITH). Names starting with an underscore are rejected, except <code>_dict</code>. On v14 and later enable server scripts with <code>bench set-config -g server_script_enabled 1</code>.</p>
      <DialogBar><button className="btn btn-primary" onClick={close}>Close</button></DialogBar>
    </Modal>
  );
}
