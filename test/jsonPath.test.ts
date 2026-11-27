import { describe, expect, it } from 'vitest';
import {
  arrayInfoAt,
  collectArrays,
  describePath,
  formatPath,
  isJson,
  parsePath,
  pathAtOffset,
  rangeForPath,
  resolvePath,
  type PathSegment,
} from '../src/core/json';
import { ToolError } from '../src/core/tool';

/** Splits `text` at the `|` cursor marker. */
function cursor(marked: string): [string, number] {
  const offset = marked.indexOf('|');
  if (offset === -1) throw new Error('no | in test text');
  return [marked.slice(0, offset) + marked.slice(offset + 1), offset];
}

/** Path at the `|` marker, as JSONPath. */
function pathAt(marked: string): string | null {
  const [text, offset] = cursor(marked);
  const p = pathAtOffset(text, offset);
  return p === null ? null : formatPath(p);
}

/** Text of the value a path resolves to. */
function valueAt(text: string, path: string): string | null {
  const r = rangeForPath(text, parsePath(path));
  return r ? text.slice(r.offset, r.offset + r.length) : null;
}

describe('formatPath', () => {
  const segs: PathSegment[] = ['users', 3, 'name'];

  it('writes the three styles', () => {
    expect(formatPath(segs, 'jsonpath')).toBe('$.users[3].name');
    expect(formatPath(segs, 'pointer')).toBe('/users/3/name');
    expect(formatPath(segs, 'js')).toBe('users[3].name');
    expect(formatPath(segs)).toBe('$.users[3].name');
  });

  it('writes the root', () => {
    expect(formatPath([], 'jsonpath')).toBe('$');
    expect(formatPath([], 'pointer')).toBe('');
    expect(formatPath([], 'js')).toBe('');
    expect(describePath([], 'pointer')).toBe('(document root)');
    expect(formatPath([0, 'a'], 'js')).toBe('[0].a');
  });

  it('quotes keys that are not identifiers', () => {
    expect(formatPath(['a-b'], 'jsonpath')).toBe("$['a-b']");
    expect(formatPath(['a.b', 'with space', ''], 'jsonpath')).toBe("$['a.b']['with space']['']");
    expect(formatPath(["it's", 'back\\slash'], 'jsonpath')).toBe("$['it\\'s']['back\\\\slash']");
    expect(formatPath(['line\nbreak'], 'jsonpath')).toBe("$['line\\nbreak']");
    expect(formatPath(['café', '1st'], 'jsonpath')).toBe("$['café']['1st']");
    expect(formatPath(['a-b', 'c'], 'js')).toBe('["a-b"].c');
    expect(formatPath(['x', 'say "hi"'], 'js')).toBe('x["say \\"hi\\""]');
    expect(formatPath(['$ok', '_ok'], 'jsonpath')).toBe('$.$ok._ok');
  });

  it('escapes ~ and / in pointers', () => {
    expect(formatPath(['a/b', 'm~n', ''], 'pointer')).toBe('/a~1b/m~0n/');
  });
});

describe('parsePath', () => {
  it('reads every style back', () => {
    const samples: PathSegment[][] = [
      [],
      ['users', 3, 'name'],
      [0, 'a'],
      ['a-b', 'with space', '', "it's", 'back\\slash', 'line\nbreak', 'café', 'say "hi"'],
    ];
    for (const segs of samples) {
      expect(parsePath(formatPath(segs, 'jsonpath'))).toEqual(segs);
      expect(parsePath(formatPath(segs, 'js'))).toEqual(segs);
    }
    // Pointers keep every segment as a string; resolvePath reads digits as indexes in arrays.
    expect(parsePath('/users/3/name')).toEqual(['users', '3', 'name']);
    expect(parsePath('/a~1b/m~0n/')).toEqual(['a/b', 'm~n', '']);
  });

  it('accepts the usual spellings', () => {
    expect(parsePath('$')).toEqual([]);
    expect(parsePath('  ')).toEqual([]);
    expect(parsePath('$.a.b')).toEqual(['a', 'b']);
    expect(parsePath('.a[0]')).toEqual(['a', 0]);
    expect(parsePath('$["a"]["b"][10]')).toEqual(['a', 'b', 10]);
    expect(parsePath("$['\\u00e9']")).toEqual(['é']);
    expect(parsePath('$[ 2 ]')).toEqual([2]);
    expect(parsePath('$.ünïcödé')).toEqual(['ünïcödé']);
  });

  it('rejects queries with a pointer to simple paths', () => {
    for (const q of ['$..price', '$.users[*]', '$.users.*', '$.users[?(@.age > 3)]', '$[0:2]', '$[0,1]']) {
      expect(() => parsePath(q), q).toThrow(/Queries are not supported yet/);
    }
  });

  it('explains other mistakes', () => {
    expect(() => parsePath('$.')).toThrow(ToolError);
    expect(() => parsePath('$.a[')).toThrow(/missing "]"/);
    expect(() => parsePath('$[abc]')).toThrow(/not an index/);
    expect(() => parsePath('$[-1]')).toThrow(/not an index/);
    expect(() => parsePath("$['abc")).toThrow(/missing closing quote/);
    expect(() => parsePath('$.a b')).toThrow(/has a space/);
    expect(() => parsePath('$x')).toThrow(/unexpected "x"/);
  });
});

describe('pathAtOffset', () => {
  const doc = `{
  "users": [
    { "name": "Ann", "tags": ["a", "b"] },
    { "name": "Bo" }
  ],
  "a-b": { "c.d": true },
  "empty": []
}`;
  const mark = (needle: string, delta = 0) => {
    const at = doc.indexOf(needle) + delta;
    return doc.slice(0, at) + '|' + doc.slice(at);
  };

  it('on a value', () => {
    expect(pathAt(mark('"Bo"', 1))).toBe('$.users[1].name');
    expect(pathAt(mark('"b"', 1))).toBe('$.users[0].tags[1]');
    expect(pathAt(mark('true', 2))).toBe("$['a-b']['c.d']");
  });

  it('on a key or its colon gives the value path', () => {
    expect(pathAt(mark('"name": "Ann"', 2))).toBe('$.users[0].name');
    expect(pathAt(mark('"users"'))).toBe('$.users');
    expect(pathAt(mark('": true', 1))).toBe("$['a-b']['c.d']");
  });

  it('on punctuation and whitespace gives the container', () => {
    expect(pathAt(mark('[\n    {'))).toBe('$.users');
    expect(pathAt(mark(',\n    { "name": "Bo"', 1))).toBe('$.users');
    expect(pathAt(mark('{ "name": "Bo"'))).toBe('$.users[1]');
    expect(pathAt('|{"a": 1}')).toBe('$');
    expect(pathAt('{"a": 1}  |')).toBe('$');
  });

  it('at the end of a value still counts as that value', () => {
    expect(pathAt('{"a": 12|, "b": 2}')).toBe('$.a');
  });

  it('empty arrays and root arrays', () => {
    expect(pathAt(mark('[]', 1))).toBe('$.empty');
    expect(pathAt('[1, [2, |3]]')).toBe('$[1][1]');
    expect(pathAt('[[], [|]]')).toBe('$[1]');
  });

  it('keys with dots, spaces, quotes and unicode', () => {
    expect(pathAt('{"a.b": {"c d": {"say \\"hi\\"": {"ключ": |1}}}}')).toBe(
      `$['a.b']['c d']['say "hi"']['ключ']`,
    );
  });

  it('JSON with comments and trailing commas', () => {
    expect(pathAt('{\n  // comment\n  "a": [1, 2, |3,],\n  /* b */ "b": 1,\n}')).toBe('$.a[2]');
  });

  it('invalid JSON gives a partial path', () => {
    expect(pathAt('{"a": [1, 2, {"b": |')).toBe('$.a[2].b');
    expect(pathAt('{"a": {"b": tru|e}')).toBe('$.a.b');
  });

  it('no JSON at all', () => {
    expect(pathAt('|')).toBeNull();
  });

  it('CRLF line endings', () => {
    const crlf = '{\r\n  "a": [\r\n    1,\r\n    2\r\n  ]\r\n}';
    const offset = crlf.indexOf('2');
    expect(formatPath(pathAtOffset(crlf, offset)!)).toBe('$.a[1]');
    expect(valueAt(crlf, '$.a[1]')).toBe('2');
  });
});

describe('resolvePath / rangeForPath', () => {
  const doc = '{"users": [{"name": "Ann"}, {"name": "Bo"}], "a-b": {"x": null}, "n": 5}';

  it('finds values in any style', () => {
    expect(valueAt(doc, '$.users[1].name')).toBe('"Bo"');
    expect(valueAt(doc, 'users[1]')).toBe('{"name": "Bo"}');
    expect(valueAt(doc, '/users/0/name')).toBe('"Ann"');
    expect(valueAt(doc, "$['a-b'].x")).toBe('null');
    expect(valueAt(doc, '$')).toBe(doc);
    expect(valueAt(doc, '')).toBe(doc);
  });

  it('says where the path stops matching', () => {
    expect(resolvePath(doc, ['users', 5])).toEqual({ found: false, reason: '$.users is an array with 2 items', resolved: 1 });
    expect(resolvePath(doc, ['users', 'name'])).toMatchObject({ found: false, reason: '$.users is an array with 2 items, so it has no key "name"' });
    expect(resolvePath(doc, ['nope'])).toMatchObject({ found: false, reason: '$ has no key "nope"', resolved: 0 });
    expect(resolvePath(doc, ['n', 'x'])).toMatchObject({ found: false, reason: '$.n is a number, not an object or array' });
    expect(resolvePath('', [])).toMatchObject({ found: false });
    expect(rangeForPath(doc, ['nope'])).toBeNull();
  });

  it('a digit key in an object stays a key', () => {
    expect(valueAt('{"0": "zero"}', '/0')).toBe('"zero"');
    expect(valueAt('{"0": "zero"}', '$[0]')).toBeNull();
  });

  it('duplicate keys: the last one wins, as in JSON.parse', () => {
    const dup = '{"a": 1, "a": 2}';
    expect(valueAt(dup, '$.a')).toBe('2');
    // Both keys have the same path.
    expect(pathAt('{"a": |1, "a": 2}')).toBe('$.a');
    expect(pathAt('{"a": 1, "a": |2}')).toBe('$.a');
  });

  it('works on JSONC and half-written JSON', () => {
    expect(valueAt('{/* c */ "a": [1, 2,],}', '$.a[1]')).toBe('2');
    expect(valueAt('{"a": [1, 2', '$.a[1]')).toBe('2');
  });
});

describe('arrayInfoAt', () => {
  const info = (marked: string) => {
    const [text, offset] = cursor(marked);
    const r = arrayInfoAt(text, offset);
    return r && { count: r.count, path: formatPath(r.path), text: text.slice(r.range.offset, r.range.offset + r.range.length) };
  };

  it('closest enclosing array', () => {
    expect(info('{"a": [1, [2, |3], 4]}')).toEqual({ count: 2, path: '$.a[1]', text: '[2, 3]' });
    expect(info('{"a": [1, |[2, 3], 4]}')).toEqual({ count: 2, path: '$.a[1]', text: '[2, 3]' });
    expect(info('{"a": [1, [2, 3]|, 4]}')).toEqual({ count: 2, path: '$.a[1]', text: '[2, 3]' });
    expect(info('{"a": [1, [2, 3], |4]}')).toEqual({ count: 3, path: '$.a', text: '[1, [2, 3], 4]' });
    expect(info('{"a": [{"b": |1}]}')).toEqual({ count: 1, path: '$.a', text: '[{"b": 1}]' });
  });

  it('on the key of an array', () => {
    expect(info('{"it|ems": [1, 2, 3]}')).toEqual({ count: 3, path: '$.items', text: '[1, 2, 3]' });
  });

  it('empty and root arrays', () => {
    expect(info('{"e": [|]}')).toEqual({ count: 0, path: '$.e', text: '[]' });
    expect(info('[1, 2, |3]')).toEqual({ count: 3, path: '$', text: '[1, 2, 3]' });
  });

  it('not in an array', () => {
    expect(info('{"a": |1}')).toBeNull();
    expect(info('|')).toBeNull();
  });

  it('JSONC: trailing commas are not items', () => {
    expect(info('[1, 2, 3,| // c\n]')).toMatchObject({ count: 3 });
  });
});

describe('collectArrays', () => {
  it('lists every array in document order', () => {
    const text = '{"a": [1, [], [2, 3]], "b": {"c": ["x"]}}';
    expect(collectArrays(text)).toEqual([
      { openBracketOffset: text.indexOf('[1'), count: 3 },
      { openBracketOffset: text.indexOf('[]'), count: 0 },
      { openBracketOffset: text.indexOf('[2'), count: 2 },
      { openBracketOffset: text.indexOf('["x"]'), count: 1 },
    ]);
    expect(collectArrays('')).toEqual([]);
    expect(collectArrays('[1, 2')).toEqual([{ openBracketOffset: 0, count: 2 }]);
  });
});

describe('isJson', () => {
  it('accepts JSON and JSONC, rejects the rest', () => {
    expect(isJson('{"a": 1}')).toBe(true);
    expect(isJson('[1, 2,] // c')).toBe(true);
    expect(isJson('"just a string"')).toBe(true);
    expect(isJson('{"a": ')).toBe(false);
    expect(isJson('hello world')).toBe(false);
    expect(isJson('')).toBe(false);
  });
});
