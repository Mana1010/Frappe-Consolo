import {
  commitEpilogue,
  commitOutcome,
  DRY_EPILOGUE,
  dryOutcome,
  lineCount,
  PRELUDE,
  PRELUDE_LINES,
  renumberTraceback,
  splitMarkers,
  wrap,
} from './protocol';

describe('PRELUDE', () => {
  it('has 13 lines and ends with a newline', () => {
    expect(PRELUDE_LINES).toBe(13);
    expect(PRELUDE.endsWith('\n')).toBe(true);
    expect(PRELUDE.startsWith('fsb_plan = []\n')).toBe(true);
  });

  it('puts user line 1 right after the prelude', () => {
    const s = wrap('a = 1\nb = 2', DRY_EPILOGUE).split('\n');
    expect(s[PRELUDE_LINES]).toBe('a = 1');
    expect(s[PRELUDE_LINES + 2]).toMatch(/^log\("@@FSB_PLAN@@"/);
    expect(wrap('a = 1\n', DRY_EPILOGUE)).toBe(
      PRELUDE + 'a = 1\n' + DRY_EPILOGUE,
    );
  });
});

describe('markers', () => {
  it('strips marker lines and reads the last one', () => {
    const r = splitMarkers('hello\n@@FSB_PLAN@@[]\n');
    expect(r.visible).toBe('hello\n');
    expect(r.marker).toEqual({ kind: 'PLAN', value: '[]' });
  });

  it('ignores a marker the user printed earlier', () => {
    const r = splitMarkers('@@FSB_APPLIED@@99\nsomething else');
    expect(r.marker).toBeNull();
    expect(r.visible).toBe('something else');
  });

  it('parses a dry run plan and keeps the exact text', () => {
    const planText =
      '[{"after": "x", "before": null, "doctype": "Customer", "field": "tax_id", "how": "db", "ignore_validate": false, "name": "C1"}]';
    const o = dryOutcome('1 row\n@@FSB_PLAN@@' + planText, 1);
    expect(o).toMatchObject({ status: 'OK', output: '1 row', planText });
    expect('plan' in o && o.plan[0].field).toBe('tax_id');
  });

  it('classifies commit results', () => {
    expect(commitOutcome('@@FSB_APPLIED@@3', 1)).toMatchObject({
      status: 'OK',
      applied: 3,
    });
    expect(commitOutcome('x\n@@FSB_ABORT@@The data changed', 1)).toMatchObject({
      status: 'ABORTED',
      error: 'The data changed',
      output: 'x',
    });
    expect(
      commitOutcome('Traceback (most recent call last):\n  boom', 1).status,
    ).toBe('ERROR');
    expect(commitOutcome('', 1).status).toBe('FAILED');
    expect(dryOutcome('no marker', 1).status).toBe('FAILED');
  });
});

describe('renumberTraceback', () => {
  const tb = (n: number, file = '<serverscript>') =>
    `Traceback (most recent call last):\n  File "${file}", line ${n}, in <module>\nNameError: x`;

  it('shifts lines inside the user code', () => {
    expect(renumberTraceback(tb(PRELUDE_LINES + 2), 3)).toContain('line 2,');
    expect(renumberTraceback(tb(PRELUDE_LINES + 1, '<unknown>'), 3)).toContain(
      'line 1,',
    );
  });

  it('leaves prelude and epilogue lines alone', () => {
    expect(renumberTraceback(tb(5), 3)).toContain('line 5,');
    expect(renumberTraceback(tb(PRELUDE_LINES + 4), 3)).toContain(
      `line ${PRELUDE_LINES + 4},`,
    );
  });

  it('only touches tracebacks', () => {
    expect(renumberTraceback('File "<unknown>", line 20', 30)).toBe(
      'File "<unknown>", line 20',
    );
  });

  it('counts user lines', () => {
    expect(lineCount('a\nb\n')).toBe(2);
    expect(lineCount('a')).toBe(1);
  });
});

describe('commitEpilogue', () => {
  // A Python string literal from JSON.stringify: one line, starts and ends with ",
  // only JSON escapes inside, and decodes back to exactly the plan text.
  it.each([
    ['quotes', '[{"after": "say \\"hi\\" \'x\'"}]'],
    ['backslashes', '[{"after": "C:\\\\temp\\\\new"}]'],
    ['unicode', '[{"after": "café ✓ 日本 \\u00e9"}]'],
    ['newlines', '[{"after": "a\\nb"}]\n'],
    ['control chars', 'x\u0000\u0007\t\r\u2028y'],
  ])('embeds %s verbatim', (_, planText) => {
    const first = commitEpilogue(planText).split('\n')[0];
    const m = first.match(/^fsb_expected = json\.loads\((".*")\)$/s);
    expect(m).not.toBeNull();
    const lit = m![1];
    expect(JSON.parse(lit)).toBe(planText);
    expect(lit).not.toMatch(/[\n\r]/);
    // every backslash starts a JSON escape that Python reads the same way
    expect(lit.slice(1, -1)).not.toMatch(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/);
    expect(lit.slice(1, -1)).not.toMatch(/(^|[^\\])(\\\\)*"/);
  });

  it('keeps the rest of the epilogue intact', () => {
    const e = commitEpilogue('[]');
    expect(e).toContain('log("@@FSB_APPLIED@@" + str(len(fsb_plan)))');
    expect(e.split('\n')).toHaveLength(26);
  });
});
