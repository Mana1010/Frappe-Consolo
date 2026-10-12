import { childDoctype } from "./analyze";
import type { Schema } from "./types";

export type TemplateValue = null | string | TemplateValue[] | { [k: string]: TemplateValue };

/**
 * A doctype's shape with every value null, for the preview panel when there is no record
 * (or no connection). Child tables become a one-row list so their fields show too.
 */
export function doctypeTemplate(schema: Schema, doctype: string, depth = 0): { [k: string]: TemplateValue } {
  // as_dict() always carries the doctype name, so the template does too
  const out: { [k: string]: TemplateValue } = { doctype };
  for (const c of schema[doctype]?.cols || []) {
    const child = childDoctype(schema, doctype, c);
    // one level of child tables is enough; Frappe doesn't nest tables inside child rows
    out[c] = child ? (depth === 0 && schema[child] ? [doctypeTemplate(schema, child, depth + 1)] : []) : null;
  }
  return out;
}
