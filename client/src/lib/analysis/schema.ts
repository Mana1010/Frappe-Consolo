import { BASEC, CHILDC, SCHEMA0 } from "./data";
import type { Schema } from "./types";

export interface LiveField { f: string; t: string; o?: string; l?: string }
export interface LiveDoctype { name: string; istable: number | boolean; issingle: number | boolean; fields: LiveField[] }

/** Turn the server's schema cache into the { doctype: { cols } } map the analysis code uses. */
export function schemaFromLive(doctypes: LiveDoctype[] | null | undefined): Schema {
  if (!doctypes || !doctypes.length) return SCHEMA0;
  const out: Schema = {};
  for (const d of doctypes) {
    const base = d.istable ? CHILDC : BASEC, types: Record<string, string> = {};
    const cols = base.slice();
    for (const f of d.fields || []) {
      if (!cols.includes(f.f)) cols.push(f.f);
      types[f.f] = f.t + (f.o && (f.t === "Link" || f.t === "Table" || f.t === "Table MultiSelect") ? " → " + f.o : "");
    }
    out[d.name] = { cols, istable: !!d.istable, issingle: !!d.issingle, types };
  }
  return out;
}
