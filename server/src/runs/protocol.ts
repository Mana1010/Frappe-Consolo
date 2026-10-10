// Write-mode protocol: Python injected around the user's code (SPEC "Write-mode protocol").
import { isTraceback } from '../common/text';

export const PRELUDE = `fsb_plan = []
def fsb_record(doctype, name, values, how, ignore_validate):
    if not isinstance(values, dict) or not values:
        frappe.throw("Pass the changes as a dict of field: value")
    current = frappe.db.get_value(doctype, name, list(values.keys()), as_dict=True)
    if not current:
        frappe.throw("Not found: " + str(doctype) + " " + str(name))
    for f in sorted(values.keys()):
        fsb_plan.append({"doctype": doctype, "name": name, "field": f, "before": current.get(f), "after": values[f], "how": how, "ignore_validate": ignore_validate})
def set_value(doctype, name, field, value=None):
    fsb_record(doctype, name, field if isinstance(field, dict) else {field: value}, "db", False)
def update_doc(doctype, name, values, ignore_validate=False):
    fsb_record(doctype, name, values, "doc", bool(ignore_validate))
`;

/** User code line 1 is script line PRELUDE_LINES + 1. */
export const PRELUDE_LINES = PRELUDE.split('\n').length - 1;

export const DRY_EPILOGUE = `log("@@FSB_PLAN@@" + json.dumps(fsb_plan, default=str, sort_keys=True))
`;

/** JSON.stringify of a string is also a valid Python string literal. */
export const commitEpilogue = (
  planText: string,
) => `fsb_expected = json.loads(${JSON.stringify(planText)})
fsb_actual = json.loads(json.dumps(fsb_plan, default=str, sort_keys=True))
if fsb_actual != fsb_expected:
    log("@@FSB_ABORT@@The data changed since the dry run, so nothing was written. Run the dry run again.")
else:
    try:
        fsb_docs = {}
        for c in fsb_plan:
            if c["how"] == "db":
                frappe.db.set_value(c["doctype"], c["name"], c["field"], c["after"])
            else:
                k = (c["doctype"], c["name"])
                if k not in fsb_docs:
                    fsb_docs[k] = {"values": {}, "ignore_validate": c["ignore_validate"]}
                fsb_docs[k]["values"][c["field"]] = c["after"]
        for k in fsb_docs:
            d = frappe.get_doc(k[0], k[1])
            d.update(fsb_docs[k]["values"])
            if fsb_docs[k]["ignore_validate"]:
                d.flags.ignore_validate = True
            d.save()
        log("@@FSB_APPLIED@@" + str(len(fsb_plan)))
    except Exception as e:
        frappe.db.rollback()
        log("@@FSB_ABORT@@Writing failed, so everything was rolled back: " + str(e))
`;

export const wrap = (code: string, epilogue: string) =>
  PRELUDE + code + (code.endsWith('\n') ? '' : '\n') + epilogue;

export const lineCount = (code: string) =>
  code.replace(/\n$/, '').split('\n').length;

const MARKER_LINE = /^@@FSB_[A-Z_]*@@/;

export interface Marker {
  kind: string;
  value: string;
}

/**
 * Visible output without marker lines, plus the protocol marker. Only the LAST
 * line counts as a marker: the epilogue logs last, so a marker the user's own
 * code printed earlier can't fake a result.
 */
export function splitMarkers(raw: string): {
  visible: string;
  marker: Marker | null;
} {
  const lines = raw.replace(/\r/g, '').split('\n');
  let i = lines.length - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  const m = i >= 0 ? lines[i].match(/^@@FSB_([A-Z_]+)@@(.*)$/) : null;
  return {
    visible: lines.filter((l) => !MARKER_LINE.test(l)).join('\n'),
    marker: m ? { kind: m[1], value: m[2] } : null,
  };
}

/** Best effort: traceback line numbers inside the user's code, relative to what they typed. */
export function renumberTraceback(out: string, userLines: number): string {
  if (!isTraceback(out)) return out;
  return out.replace(
    /(File "<(?:serverscript|unknown|string)>", line )(\d+)/g,
    (all, pre: string, n: string) => {
      const k = +n - PRELUDE_LINES;
      return k >= 1 && k <= userLines ? pre + k : all;
    },
  );
}

export interface Change {
  doctype: string;
  name: string;
  field: string;
  before: unknown;
  after: unknown;
  how: 'db' | 'doc';
  ignore_validate: boolean;
}

export function parsePlan(text: string): Change[] {
  const v = JSON.parse(text) as unknown;
  if (!Array.isArray(v)) throw new Error('The plan is not a list.');
  for (const c of v as Partial<Change>[])
    if (!c || typeof c.doctype !== 'string' || typeof c.field !== 'string')
      throw new Error('The plan has an invalid entry.');
  return v as Change[];
}

export type Outcome =
  | { status: 'OK'; output: string; plan: Change[]; planText: string }
  | { status: 'OK'; output: string; applied: number }
  | { status: 'ERROR' | 'FAILED' | 'ABORTED'; output: string; error: string };

export function dryOutcome(raw: string, userLines: number): Outcome {
  const { visible, marker } = splitMarkers(raw);
  const output = renumberTraceback(visible, userLines);
  if (marker?.kind === 'PLAN')
    try {
      return {
        status: 'OK',
        output,
        plan: parsePlan(marker.value),
        planText: marker.value,
      };
    } catch (e) {
      return {
        status: 'FAILED',
        output,
        error: 'Could not read the plan: ' + (e as Error).message,
      };
    }
  if (isTraceback(raw))
    return {
      status: 'ERROR',
      output,
      error: 'Python error. Nothing was written.',
    };
  return {
    status: 'FAILED',
    output,
    error: 'The dry run did not return a plan.',
  };
}

export function commitOutcome(raw: string, userLines: number): Outcome {
  const { visible, marker } = splitMarkers(raw);
  const output = renumberTraceback(visible, userLines);
  if (marker?.kind === 'APPLIED')
    return { status: 'OK', output, applied: parseInt(marker.value, 10) || 0 };
  if (marker?.kind === 'ABORT')
    return { status: 'ABORTED', output, error: marker.value };
  if (isTraceback(raw))
    return {
      status: 'ERROR',
      output,
      error:
        'Python error while planning, so nothing was written (the planning phase only reads).',
    };
  return {
    status: 'FAILED',
    output,
    error:
      'The commit run returned no result. Check the data before running the dry run again.',
  };
}
