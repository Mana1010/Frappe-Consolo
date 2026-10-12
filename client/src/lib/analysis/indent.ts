import { blank, tokens, type Tok } from "./guard";

/*
 * Python indentation: one pass that finds each statement's correct indent with the same
 * stack rules Python's tokenizer uses. checkIndent() reports the problems, formatIndent() fixes them.
 * Only leading whitespace and trailing spaces change: string contents (including SQL in
 * triple quotes) and the number of lines never do.
 */

export const INDENT = 4;
const BRANCH = /^(else|elif|except|finally)\b/;

export interface IndentIssue { line: number; level: "error" | "warn" | "info"; msg: string }

interface PhysLine {
  text: string;
  /** line starts inside a triple-quoted string: leave it exactly as it is */
  inString: boolean;
  /** line continues a statement (open bracket or trailing backslash) */
  continuation: boolean;
  /** code with strings/comments blanked */
  code: string;
  /** line ends inside a triple-quoted string (its trailing spaces are string content) */
  endsInString: boolean;
}

const width = (ws: string) => { let w = 0; for (const c of ws) w = c === "\t" ? w + INDENT - (w % INDENT) : w + 1; return w; };
const leading = (s: string) => (s.match(/^[ \t]*/) as RegExpMatchArray)[0];

function physicalLines(text: string, toks: Tok[]): PhysLine[] {
  const code = blank(text, toks), lines = text.split("\n"), codeLines = code.split("\n"), out: PhysLine[] = [];
  // line index -> inside a triple string at the line start / at the line end
  const startIn = new Set<number>(), endIn = new Set<number>();
  for (const k of toks) {
    if (k.t !== "tstr") continue;
    const a = text.slice(0, k.s).split("\n").length - 1, b = text.slice(0, k.e).split("\n").length - 1;
    for (let i = a + 1; i <= b; i++) startIn.add(i);
    for (let i = a; i < b; i++) endIn.add(i);
    if (!k.closed) endIn.add(b);
  }
  let depth = 0, backslash = false;
  lines.forEach((t, i) => {
    out.push({ text: t, inString: startIn.has(i), continuation: depth > 0 || backslash, code: codeLines[i] ?? "", endsInString: endIn.has(i) });
    for (const c of codeLines[i] ?? "") { if ("([{".includes(c)) depth++; else if (")]}".includes(c)) depth = Math.max(0, depth - 1); }
    backslash = /\\\s*$/.test(codeLines[i] ?? "") && !endIn.has(i);
  });
  return out;
}

interface Plan {
  /** new indent width per physical line, or null to leave the line's leading whitespace alone */
  indent: (number | null)[];
  issues: IndentIssue[];
}

function plan(text: string): Plan {
  const toks = tokens(text), lines = physicalLines(text, toks), indent: (number | null)[] = lines.map(() => null), issues: IndentIssue[] = [];
  const stack = [{ orig: 0, now: 0 }];
  let expectBlock = false, opener = 0, delta = 0, tabsSeen = false, spacesSeen = false;
  const top = () => stack[stack.length - 1];
  // deepest open level whose original indent is <= w
  const levelFor = (w: number) => { for (let j = stack.length - 1; j >= 0; j--) if (stack[j].orig <= w) return stack[j]; return stack[0]; };

  lines.forEach((ln, i) => {
    const lineNo = i + 1, ws = leading(ln.text), w = width(ws);
    if (ln.inString) return;
    if (!ln.text.trim()) { indent[i] = 0; return; }
    if (ln.continuation) { indent[i] = Math.max(0, w + delta); return; }
    if (/\t/.test(ws)) tabsSeen = true; else if (ws) spacesSeen = true;
    const codeText = ln.code.trim();
    if (!codeText) {
      // comment-only line: Python ignores its indent; line it up with the block it sits in
      indent[i] = expectBlock && w > top().orig ? top().now + INDENT : levelFor(w).now;
      return;
    }
    let now: number;
    if (expectBlock && w <= top().orig && BRANCH.test(codeText)) {
      // `if x:` straight into `else:`: the block is empty; don't pull the else into it
      issues.push({ line: opener, level: "error", msg: "This block is empty. Add at least one indented line (e.g. pass)." });
      while (stack.length > 1 && top().orig > w) stack.pop();
      now = top().now;
    } else if (expectBlock) {
      if (w > top().orig) { now = top().now + INDENT; stack.push({ orig: w, now }); }
      else {
        issues.push({ line: lineNo, level: "error", msg: "Expected an indented block after line " + opener + ". Indent this line by 4 spaces." });
        now = top().now + INDENT;
      }
    } else if (BRANCH.test(codeText) && w >= top().orig && stack.length > 1) {
      // else/elif/except/finally written at the body's level: it belongs to the opener one level up
      issues.push({ line: lineNo, level: "error", msg: "'" + (codeText.match(BRANCH) as RegExpMatchArray)[1] + "' must line up with the if/try/for above it." });
      stack.pop();
      now = top().now;
    } else if (w > top().orig) {
      issues.push({ line: lineNo, level: "error", msg: "Unexpected indent. This line is indented but the line above doesn't end with ':'." });
      now = top().now;
    } else {
      while (stack.length > 1 && top().orig > w) stack.pop();
      if (top().orig !== w) issues.push({ line: lineNo, level: "error", msg: "This line doesn't line up with any outer block (unindent does not match)." });
      now = top().now;
    }
    if (ws && !/\t/.test(ws) && w % INDENT !== 0) issues.push({ line: lineNo, level: "info", msg: "Use 4 spaces per indentation level (this line has " + w + ")." });
    indent[i] = now;
    delta = now - w;
    // the statement may span lines; its last code line decides whether a block follows
    let j = i, last = codeText;
    while (j + 1 < lines.length && (lines[j + 1].continuation || lines[j + 1].inString)) { j++; if (lines[j].code.trim()) last = lines[j].code.trim(); }
    expectBlock = /:$/.test(last);
    if (expectBlock) opener = lineNo;
  });
  if (expectBlock) issues.push({ line: opener, level: "error", msg: "This line ends with ':' but has no indented block after it." });
  if (tabsSeen && spacesSeen) {
    const at = lines.findIndex(l => !l.inString && /^\t/.test(l.text));
    issues.push({ line: at + 1, level: "warn", msg: "Tabs and spaces are mixed. Python will raise an indentation error. Format converts tabs to spaces." });
  }
  return { indent, issues };
}

/** Indentation problems, using Python's own rules. */
export function checkIndent(text: string): IndentIssue[] {
  return plan(text).issues;
}

/**
 * Re-indents with 4 spaces per level, converts tabs, trims trailing spaces.
 * Lines inside triple-quoted strings are left exactly as they are.
 */
export function formatIndent(text: string): { text: string; changed: number } {
  const { indent } = plan(text), lines = text.split("\n"), toks = tokens(text), phys = physicalLines(text, toks);
  let changed = 0;
  const out = lines.map((t, i) => {
    let s = t;
    if (indent[i] !== null) s = " ".repeat(indent[i] as number) + t.replace(/^[ \t]*/, "");
    if (!phys[i].endsInString) s = s.replace(/[ \t]+$/, "");
    if (s !== t) changed++;
    return s;
  });
  return { text: out.join("\n"), changed };
}
