export const SCHEMA_SCRIPT = `rows = frappe.db.sql("""
    SELECT df.parent AS dt, df.fieldname AS f, df.fieldtype AS t, df.options AS o, df.label AS l
    FROM \`tabDocField\` df
    WHERE df.parenttype = 'DocType'
      AND df.fieldtype NOT IN ('Section Break', 'Column Break', 'Tab Break', 'HTML', 'Button', 'Heading', 'Fold')
    ORDER BY df.parent, df.idx
""", as_dict=True)
custom = frappe.db.sql("""
    SELECT dt, fieldname AS f, fieldtype AS t, options AS o, label AS l
    FROM \`tabCustom Field\`
    WHERE fieldtype NOT IN ('Section Break', 'Column Break', 'Tab Break', 'HTML', 'Button', 'Heading', 'Fold')
""", as_dict=True)
doctypes = frappe.db.sql("""SELECT name, istable, issingle FROM \`tabDocType\`""", as_dict=True)
log(json.dumps({"fields": rows, "custom": custom, "doctypes": doctypes}, default=str))
`;

export interface SchemaField {
  f: string;
  t: string;
  o?: string;
  l?: string;
}
export interface SchemaDoctype {
  name: string;
  istable: boolean;
  issingle: boolean;
  fields: SchemaField[];
}

interface RawField {
  dt?: unknown;
  f?: unknown;
  t?: unknown;
  o?: unknown;
  l?: unknown;
}
interface RawSchema {
  fields?: RawField[];
  custom?: RawField[];
  doctypes?: { name?: unknown; istable?: unknown; issingle?: unknown }[];
}

const truthy = (v: unknown) => v === true || v === 1 || v === '1';

/** Output of SCHEMA_SCRIPT → doctypes sorted by name, custom fields after standard ones, null o/l dropped. */
export function parseSchema(output: string): SchemaDoctype[] {
  const line = output
    .split('\n')
    .reverse()
    .find((l) => l.trim().startsWith('{'));
  if (!line) throw new Error('The schema script printed no JSON.');
  const raw = JSON.parse(line) as RawSchema;
  const map = new Map<string, SchemaDoctype>();
  for (const d of raw.doctypes ?? [])
    if (typeof d.name === 'string')
      map.set(d.name, {
        name: d.name,
        istable: truthy(d.istable),
        issingle: truthy(d.issingle),
        fields: [],
      });
  for (const r of [...(raw.fields ?? []), ...(raw.custom ?? [])]) {
    if (typeof r.dt !== 'string' || typeof r.f !== 'string' || !r.f) continue;
    let d = map.get(r.dt);
    if (!d) {
      d = { name: r.dt, istable: false, issingle: false, fields: [] };
      map.set(r.dt, d);
    }
    const fld: SchemaField = { f: r.f, t: typeof r.t === 'string' ? r.t : '' };
    if (typeof r.o === 'string' && r.o) fld.o = r.o;
    if (typeof r.l === 'string' && r.l) fld.l = r.l;
    d.fields.push(fld);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface SchemaDto {
  syncedAt: Date;
  doctypeCount: number;
  doctypes: SchemaDoctype[];
}
