import type { Change } from "@/lib/api/types";
import { ACCOUNTING_DOCTYPES } from "@/lib/analysis/data";

const fmt = (v: unknown) => v === null || v === undefined ? "None" : typeof v === "string" ? (v === "" ? "''" : v) : typeof v === "object" ? JSON.stringify(v) : String(v);

export const touchesAccounting = (plan: Change[] | null | undefined) => !!plan?.some(c => ACCOUNTING_DOCTYPES.includes(c.doctype));

export function AccountingWarning() {
  return (
    <div role="note" className="mb-2 rounded-md border border-warn px-2.5 py-1.5 text-[12.5px] text-warn">
      Direct changes to accounting documents don&apos;t update the GL. Prefer cancel + amend.
    </div>
  );
}

function How({ c }: { c: Change }) {
  if (c.how === "db") return <span className="badge text-warn" title="frappe.db.set_value">skips validation</span>;
  return c.ignore_validate
    ? <span className="badge text-warn" title="doc.save() with flags.ignore_validate">validation skipped</span>
    : <span className="badge text-ok" title="doc.save()">validated</span>;
}

export function PlanTable({ plan }: { plan: Change[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="ptable">
        <thead><tr><th>Doctype</th><th>Name</th><th>Field</th><th>Before → After</th><th>How</th></tr></thead>
        <tbody>
          {plan.map((c, i) => (
            <tr key={i}>
              <td>{c.doctype}</td>
              <td className="mono">{c.name}</td>
              <td className="mono">{c.field}</td>
              <td className="mono"><span className="text-mute line-through decoration-1">{fmt(c.before)}</span> → <span className="text-ink">{fmt(c.after)}</span></td>
              <td><How c={c} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
