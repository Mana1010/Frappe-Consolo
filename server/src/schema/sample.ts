/*
 * First record of a doctype, for the schema preview panel. Runs through execute_code with
 * commit 0 like every read, and only reads: get_meta, get_all/get_doc, or one SELECT for child tables.
 */

// Frappe doctype names: letters, digits, spaces and a few separators. No quotes or backticks,
// so the name is safe both as a Python string literal and inside the child-table SELECT.
export const DOCTYPE_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-.&()]{0,139}$/;

const MARK = '@@FSB_SAMPLE@@';

export interface SampleDto {
  doctype: string;
  /** null when the doctype has no records yet */
  doc: Record<string, unknown> | null;
}

/** Python for the System Console. `doctype` must already match DOCTYPE_RE. */
export function sampleScript(doctype: string): string {
  if (!DOCTYPE_RE.test(doctype)) throw new Error('Invalid doctype name');
  // JSON.stringify gives a double-quoted literal that Python reads the same way
  const dt = JSON.stringify(doctype);
  return [
    `fsb_dt = ${dt}`,
    'fsb_meta = frappe.get_meta(fsb_dt)',
    'fsb_doc = None',
    'if fsb_meta.issingle:',
    '    fsb_doc = frappe.get_doc(fsb_dt, fsb_dt).as_dict()',
    'elif fsb_meta.istable:',
    // child rows have no permissions of their own; read the first row straight from its table
    `    fsb_rows = frappe.db.sql("SELECT * FROM \`tab${doctype}\` ORDER BY creation ASC LIMIT 1", as_dict=True)`,
    '    if fsb_rows:',
    '        fsb_doc = fsb_rows[0]',
    'else:',
    '    fsb_names = frappe.get_all(fsb_dt, fields=["name"], order_by="creation asc", limit_page_length=1)',
    '    if fsb_names:',
    '        fsb_doc = frappe.get_doc(fsb_dt, fsb_names[0].name).as_dict()',
    `log("${MARK}" + json.dumps({"doc": fsb_doc}, default=str))`,
  ].join('\n');
}

/** Pulls the marker line out of the console output. Throws with Frappe's message on a traceback. */
export function parseSample(doctype: string, out: string): SampleDto {
  const line = out
    .split('\n')
    .reverse()
    .find((l) => l.startsWith(MARK));
  if (!line) {
    const last = out.trim().split('\n').pop() || 'no output';
    throw new Error(last);
  }
  const parsed = JSON.parse(line.slice(MARK.length)) as {
    doc: Record<string, unknown> | null;
  };
  return { doctype, doc: parsed.doc ?? null };
}
