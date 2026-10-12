import { DOCTYPE_RE, parseSample, sampleScript } from './sample';

describe('sampleScript', () => {
  it('embeds the doctype as a Python string literal and in the child-table SELECT', () => {
    const s = sampleScript('Sales Invoice Item');
    expect(s).toContain('fsb_dt = "Sales Invoice Item"');
    expect(s).toContain(
      'FROM `tabSales Invoice Item` ORDER BY creation ASC LIMIT 1',
    );
    expect(s).toContain('order_by="creation asc", limit_page_length=1');
    expect(s).not.toMatch(/\.save\(|\.insert\(|set_value|commit/);
  });

  it('accepts real doctype names and rejects anything that could break out of the literal', () => {
    for (const ok of [
      'Sales Invoice',
      'GL Entry',
      'Item Price',
      'POS Profile',
      'Stock Entry Detail',
      'C-Form',
      'Address & Contact',
    ])
      expect(DOCTYPE_RE.test(ok)).toBe(true);
    for (const bad of [
      '',
      'x"); frappe.db.commit(); ("',
      'tab`; DROP',
      "O'Brien",
      'a\nb',
      ' leading',
      'x'.repeat(141),
    ])
      expect(() => sampleScript(bad)).toThrow();
  });
});

describe('parseSample', () => {
  it('reads the marker line and ignores other output', () => {
    const out =
      'some log\n@@FSB_SAMPLE@@{"doc": {"name": "SINV-1", "items": [{"qty": 1}]}}';
    expect(parseSample('Sales Invoice', out)).toEqual({
      doctype: 'Sales Invoice',
      doc: { name: 'SINV-1', items: [{ qty: 1 }] },
    });
  });

  it('returns doc null when there are no records', () => {
    expect(parseSample('ToDo', '@@FSB_SAMPLE@@{"doc": null}').doc).toBeNull();
  });

  it('throws the last line when the marker is missing', () => {
    expect(() =>
      parseSample(
        'X',
        'Traceback (most recent call last):\nfrappe.exceptions.DoesNotExistError: DocType X not found',
      ),
    ).toThrow(/DoesNotExistError/);
  });
});
