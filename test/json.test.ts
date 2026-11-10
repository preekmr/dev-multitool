import { describe, expect, it } from 'vitest';
import { run } from './helpers';

describe('JSON', () => {
  it('formats with the given indentation', async () => {
    expect(await run('json.format', '{"a":1,"b":[1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    expect(await run('json.format', '{"a":1}', { indent: '\t' })).toBe('{\n\t"a": 1\n}');
    expect(await run('json.format', '{"a":1}', { indent: 4 })).toBe('{\n    "a": 1\n}');
  });

  it('minifies', async () => {
    expect(await run('json.minify', '{\n  "a": 1,\n  "b": "x y"\n}')).toBe('{"a":1,"b":"x y"}');
  });

  it('sorts keys recursively, leaving arrays in order', async () => {
    expect(await run('json.sortKeys', '{"b":{"z":1,"a":2},"a":[3,1]}', { indent: 0 })).toBe(
      '{"a":[3,1],"b":{"a":2,"z":1}}',
    );
  });

  it('reports the line and column of invalid JSON', async () => {
    await expect(run('json.format', '{\n  "a": 1,\n}')).rejects.toThrow(/Invalid JSON \(line 3, column 1\)/);
  });

  it('handles a selected array element with indentation and a trailing comma', async () => {
    const selection = '{\n    "kind": "text",\n    "n": [1]\n  },';
    expect(await run('json.minify', selection)).toBe('{"kind":"text","n":[1]},');
    expect(await run('json.format', '{"a":{"b":1}},\n')).toBe('{\n  "a": {\n    "b": 1\n  }\n},\n');
    // Re-indents to the selection's own indentation (taken from its closing line).
    expect(await run('json.format', '{"a":1,\n  "b":2\n  },')).toBe('{\n    "a": 1,\n    "b": 2\n  },');
    expect(await run('json.validate', '[1, 2],')).toBe('valid JSON (array of 2)');
  });

  it('explains when the selection holds more than one value', async () => {
    await expect(run('json.minify', '{"a":1}, {"b":2}')).rejects.toThrow(/more than one JSON value/);
  });

  it('validates', async () => {
    expect(await run('json.validate', '[1,2,3]')).toBe('valid JSON (array of 3)');
    await expect(run('json.validate', '{oops}')).rejects.toThrow(/Invalid JSON/);
  });

  it('escapes and unescapes strings', async () => {
    const escaped = await run('json.stringify', '{"a":"b"}\n');
    expect(escaped).toBe('"{\\"a\\":\\"b\\"}\\n"');
    expect(await run('json.unstringify', escaped)).toBe('{"a":"b"}\n');
    await expect(run('json.unstringify', '{"a":1}')).rejects.toThrow(/string literal/);
  });

  it('converts to YAML and back', async () => {
    const yaml = await run('json.toYaml', '{"name":"devkit","tags":["a","b"]}');
    expect(yaml).toBe('name: devkit\ntags:\n  - a\n  - b\n');
    expect(JSON.parse(await run('yaml.toJson', yaml))).toEqual({ name: 'devkit', tags: ['a', 'b'] });
  });

  it('turns multi-document YAML into an array and rejects bad YAML', async () => {
    expect(JSON.parse(await run('yaml.toJson', 'a: 1\n---\nb: 2\n'))).toEqual([{ a: 1 }, { b: 2 }]);
    await expect(run('yaml.toJson', 'a: [1, 2\n')).rejects.toThrow(/Invalid YAML/);
  });
});
