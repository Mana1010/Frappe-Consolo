/* Connection form validation, ported from the HTML (the server applies the same rules). */

export function normUrl(raw: string | undefined | null): { url: string; err?: undefined } | { err: string; url?: undefined } {
  let u = (raw || "").trim();
  if (!u) return { err: "Enter the site URL, for example http://localhost:8000" };
  if (!/^https?:\/\//i.test(u)) {
    if (/^[a-z]+:/i.test(u) && !/^[\w.-]+:\d+/.test(u)) return { err: "Use an http:// or https:// address." };
    u = (/^(localhost|127\.|\[::1\]|[\w-]+\.localhost|[\w.-]+\.test)\b/i.test(u) ? "http://" : "https://") + u;
  }
  try {
    const x = new URL(u);
    if (!x.hostname) throw new Error("no host");
    return { url: x.origin };
  } catch {
    return { err: "That is not a valid URL." };
  }
}

/** Accepts "key", or a pasted "token key:secret" / "Authorization: token key:secret". */
export function splitToken(v: string | undefined | null): { key: string; secret: string } | null {
  const m = (v || "").match(/^\s*(?:authorization\s*:\s*)?(?:token\s+)?([^\s:]+)\s*:\s*(\S+)\s*$/i);
  return m ? { key: m[1], secret: m[2] } : null;
}

export function credErr(v: string, what: "key" | "secret"): string {
  if (!v) return what === "key" ? "Enter the API key." : "Enter the API secret. Frappe shows it only once, right after Generate Keys.";
  if (/\s/.test(v)) return "The " + what + " cannot contain spaces.";
  if (/:/.test(v)) return "Paste the key and the secret in their own fields, without the ':'.";
  if (!/^[A-Za-z0-9]+$/.test(v)) return "The " + what + " should be letters and digits only.";
  if (v.length < 10 || v.length > 64) return "That does not look like a Frappe API " + what + " (usually 15 characters, this one has " + v.length + ").";
  return "";
}

export function nameErr(name: string, others: { id: string; name: string }[], id?: string | null): string {
  const n = name.trim();
  if (!n) return "Give the connection a name.";
  if (n.length > 40) return "Keep the name to 40 characters or fewer.";
  if (others.some(c => c.id !== id && c.name.toLowerCase() === n.toLowerCase())) return "Another connection already uses this name.";
  return "";
}
