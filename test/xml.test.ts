import { describe, expect, it } from 'vitest';
import { run } from './helpers';

describe('XML', () => {
  it('formats and minifies', async () => {
    const formatted = await run('xml.format', '<root><a x="1">text</a><b/></root>');
    expect(formatted).toBe('<root>\n  <a x="1">text</a>\n  <b/>\n</root>');
    expect(await run('xml.minify', formatted)).toBe('<root><a x="1">text</a><b/></root>');
  });

  it('rejects malformed XML', async () => {
    await expect(run('xml.format', '<root><a></root>')).rejects.toThrow(/Invalid XML/);
  });
});

describe('XML validate', () => {
  it('reports position of errors', async () => {
    expect(await run('xml.validate', '<?xml version="1.0"?>\n<a><b/></a>')).toBe('well-formed XML');
    await expect(run('xml.validate', '<a>\n  <b>\n</a>')).rejects.toThrow(/line \d+, column \d+/);
  });
});
