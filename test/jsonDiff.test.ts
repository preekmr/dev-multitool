import { describe, expect, it } from 'vitest';
import {
  describeChange,
  diffJson,
  formatJson,
  formatPath,
  parseDocument,
  renderMarkdown,
  summarize,
  summaryText,
} from '../src/compare/diff';
import { lineForPath } from '../src/compare/lineForPath';
import { run } from './helpers';

describe('parseDocument', () => {
  it('parses strict JSON and strips a BOM', () => {
    expect(parseDocument('﻿{"a":1}', 'Left')).toEqual({ value: { a: 1 }, jsonc: false });
  });

  it('accepts comments and trailing commas (tsconfig.json, settings.json)', () => {
    const text = '{\n  // editor\n  "a": 1, /* block */\n  "b": [1, 2,],\n}';
    expect(parseDocument(text, 'Left')).toEqual({ value: { a: 1, b: [1, 2] }, jsonc: true });
  });

  it('names the side and position in errors', () => {
    expect(() => parseDocument('{\n  "a": 1\n  "b": 2\n}', 'Right (b.json)')).toThrow(
      /^Right \(b\.json\): Invalid JSON \(line 3, column 3\): Comma expected\.$/,
    );
    expect(() => parseDocument('  \n', 'Left (a.json)')).toThrow('Left (a.json) is empty.');
  });
});

describe('formatPath', () => {
  it('uses dot notation for identifiers and brackets otherwise', () => {
    expect(formatPath([])).toBe('$');
    expect(formatPath(['user', 'roles', 2])).toBe('$.user.roles[2]');
    expect(formatPath(['a b', 'x-y', '$ok', '1st'])).toBe('$["a b"]["x-y"].$ok["1st"]');
  });
});

describe('diffJson', () => {
  it('finds changed, added and removed values at any depth', () => {
    const left = { user: { name: 'Pradeep', roles: ['dev'] }, beta: true, n: 1 };
    const right = { user: { name: 'Pradeep B', roles: ['dev', 'admin'] }, n: 1, extra: null };
    expect(diffJson(left, right)).toEqual([
      { kind: 'removed', path: ['beta'], oldValue: true },
      { kind: 'added', path: ['extra'], newValue: null },
      { kind: 'changed', path: ['user', 'name'], oldValue: 'Pradeep', newValue: 'Pradeep B' },
      { kind: 'added', path: ['user', 'roles', 1], newValue: 'admin' },
    ]);
  });

  it('ignores key order and formatting', () => {
    expect(diffJson(JSON.parse('{"a":1,"b":{"c":2,"d":3}}'), JSON.parse('{ "b": { "d": 3, "c": 2 }, "a": 1 }'))).toEqual([]);
  });

  it('reports type changes, including null vs value and object vs array', () => {
    expect(diffJson({ a: '5', b: null, c: {}, d: [] }, { a: 5, b: 0, c: [], d: [] })).toEqual([
      { kind: 'changed', path: ['a'], oldValue: '5', newValue: 5, typeChanged: true },
      { kind: 'changed', path: ['b'], oldValue: null, newValue: 0, typeChanged: true },
      { kind: 'changed', path: ['c'], oldValue: {}, newValue: [], typeChanged: true },
    ]);
  });

  it('treats null and a missing key as different', () => {
    expect(diffJson({ a: null }, {})).toEqual([{ kind: 'removed', path: ['a'], oldValue: null }]);
  });

  it('compares numbers by value (1 and 1.0 are equal)', () => {
    expect(diffJson(JSON.parse('{"a":1.0,"b":1e2}'), JSON.parse('{"a":1,"b":100}'))).toEqual([]);
  });

  it('compares arrays by position', () => {
    expect(diffJson([1, 2, 3], [0, 1, 2, 3])).toEqual([
      { kind: 'changed', path: [0], oldValue: 1, newValue: 0 },
      { kind: 'changed', path: [1], oldValue: 2, newValue: 1 },
      { kind: 'changed', path: [2], oldValue: 3, newValue: 2 },
      { kind: 'added', path: [3], newValue: 3 },
    ]);
    expect(diffJson([1, 2], [1])).toEqual([{ kind: 'removed', path: [1], oldValue: 2 }]);
  });

  it('compares top-level primitives and handles a key named __proto__', () => {
    expect(diffJson('a', 'b')).toEqual([{ kind: 'changed', path: [], oldValue: 'a', newValue: 'b' }]);
    const l = JSON.parse('{"__proto__": 1}');
    const r = JSON.parse('{"__proto__": 2}');
    expect(diffJson(l, r)).toEqual([{ kind: 'changed', path: ['__proto__'], oldValue: 1, newValue: 2 }]);
  });

  it('keeps document key order when sortKeys is off', () => {
    const changes = diffJson({ z: 1, a: 1 }, { z: 2, a: 2, m: 0 }, { sortKeys: false });
    expect(changes.map((c) => formatPath(c.path))).toEqual(['$.z', '$.a', '$.m']);
  });
});

describe('formatJson', () => {
  const value = { b: [1, { y: [], x: {} }], a: 'é"\n', c: null, d: [], e: {} };

  it('matches JSON.stringify output exactly when keys are not sorted', () => {
    for (const indent of ['  ', '    ', '\t']) {
      expect(formatJson(value, indent, false).text).toBe(JSON.stringify(value, null, indent) + '\n');
    }
  });

  it('matches the JSON Sort Keys tool when keys are sorted', async () => {
    const sorted = await run('json.sortKeys', JSON.stringify(value));
    expect(formatJson(value, '  ', true).text).toBe(sorted + '\n');
  });

  it('records the line of every value', () => {
    const { text, lineOf } = formatJson({ b: [10, { x: 1 }], a: 2 }, '  ', true);
    const lines = text.split('\n');
    expect(lines[lineOf.get('$.a')!]).toBe('  "a": 2,');
    expect(lines[lineOf.get('$.b')!]).toBe('  "b": [');
    expect(lines[lineOf.get('$.b[0]')!]).toBe('    10,');
    expect(lines[lineOf.get('$.b[1].x')!]).toBe('      "x": 1');
    expect(lineOf.get('$')).toBe(0);
  });

  it('finds the nearest existing ancestor for paths missing on one side', () => {
    const { lineOf } = formatJson({ user: { name: 'x' } }, '  ', true);
    expect(lineForPath(lineOf, ['user', 'roles', 3])).toBe(lineOf.get('$.user'));
    expect(lineForPath(lineOf, ['nope'])).toBe(0);
  });
});

describe('report', () => {
  const changes = diffJson({ a: 'x|y', b: 1, gone: [1] }, { a: 'z`', b: '1', added: { k: true } });

  it('summarizes', () => {
    expect(summaryText(summarize(changes))).toBe('2 changed · 1 added · 1 removed');
    expect(summaryText(summarize([]))).toBe('No differences');
  });

  it('describes each change in one line', () => {
    expect(changes.map(describeChange)).toEqual(['"x|y" → "z`"', '+ {"k":true}', '1 → "1"  (number → string)', '− [1]']);
    expect(describeChange({ kind: 'added', path: [], newValue: 'x'.repeat(100) })).toMatch(/^\+ "x{58}…$/);
  });

  it('renders a Markdown table that survives pipes and backticks', () => {
    expect(renderMarkdown(changes, 'a.json', 'b.json')).toBe(
      [
        '**JSON diff:** `a.json` → `b.json`',
        '',
        '2 changed · 1 added · 1 removed',
        '',
        '| | Path | Before | After |',
        '| --- | --- | --- | --- |',
        '| ~ changed | `$.a` | `"x\\|y"` | `` "z`" `` |',
        '| + added | `$.added` |  | `{"k":true}` |',
        '| ~ changed | `$.b` | `1` | `"1"` |',
        '| − removed | `$.gone` | `[1]` |  |',
        '',
      ].join('\n'),
    );
  });

  it('caps very long reports', () => {
    const many = diffJson([], Array.from({ length: 510 }, (_, i) => i));
    const md = renderMarkdown(many, 'l', 'r');
    expect(md).toContain('…and 10 more changes.');
    expect(md.split('\n').filter((l) => l.startsWith('| + added')).length).toBe(500);
  });
});
