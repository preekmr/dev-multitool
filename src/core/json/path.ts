/**
 * JSON paths as segment lists, and how to write and read them.
 * Pure: no `vscode` import.
 */
import { ToolError } from '../tool';

/** A key (string) or an array index (number). `[]` is the document root. */
export type PathSegment = string | number;

/**
 * - `jsonpath`: `$.users[3].name`, keys that aren't identifiers in quotes: `$['a-b']`
 * - `pointer`:  `/users/3/name` (RFC 6901; the root is the empty string)
 * - `js`:       `users[3].name` (the root is the empty string)
 */
export type PathStyle = 'jsonpath' | 'pointer' | 'js';

export const PATH_STYLES: readonly PathStyle[] = ['jsonpath', 'pointer', 'js'];
export const DEFAULT_PATH_STYLE: PathStyle = 'jsonpath';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Single-quoted key for JSONPath brackets: `['it\'s']`. */
function quoteSingle(key: string): string {
  const body = key.replace(/[\\'\n\r\t]/g, (c) => ({ '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t' })[c]!);
  return `'${body}'`;
}

export function formatPath(segments: readonly PathSegment[], style: PathStyle = DEFAULT_PATH_STYLE): string {
  switch (style) {
    case 'pointer':
      return segments.map((s) => '/' + String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
    case 'js': {
      let out = '';
      for (const s of segments) {
        if (typeof s === 'number') out += `[${s}]`;
        else if (IDENTIFIER.test(s)) out += out === '' ? s : `.${s}`;
        else out += `[${JSON.stringify(s)}]`;
      }
      return out;
    }
    case 'jsonpath':
    default: {
      let out = '$';
      for (const s of segments) {
        if (typeof s === 'number') out += `[${s}]`;
        else if (IDENTIFIER.test(s)) out += `.${s}`;
        else out += `[${quoteSingle(s)}]`;
      }
      return out;
    }
  }
}

/** Shown for an empty pointer or JS path, which would otherwise read as nothing. */
export function describePath(segments: readonly PathSegment[], style: PathStyle = DEFAULT_PATH_STYLE): string {
  const text = formatPath(segments, style);
  return text === '' ? '(document root)' : text;
}

const QUERY_HINT = 'Queries are not supported yet. Use a simple path like $.users[3].name, users[3].name or /users/3/name.';

/**
 * Reads a simple path in any of the three styles:
 * `$`, `$.a.b`, `$['a-b']`, `$["a"][0]`, `a.b[0]`, `[0].a`, `/a/0`, and the empty string for the root.
 * Query syntax (`..`, `*`, filters) is rejected with a clear message.
 */
export function parsePath(input: string): PathSegment[] {
  const text = input.trim();
  if (text === '' || text === '$') return [];
  if (text.startsWith('/')) return parsePointer(text);

  const segments: PathSegment[] = [];
  let i = 0;
  const fail = (what: string): never => {
    throw new ToolError(`Invalid path at character ${i + 1}: ${what}.`);
  };

  if (text[0] === '$') i = 1;
  else if (text[0] !== '.' && text[0] !== '[') {
    // JS style: starts with a bare key.
    const key = readName();
    if (key === '') fail('expected a key');
    segments.push(key);
  }

  function readName(): string {
    const start = i;
    while (i < text.length && text[i] !== '.' && text[i] !== '[') i++;
    return text.slice(start, i);
  }

  while (i < text.length) {
    const c = text[i];
    if (c === '.') {
      if (text[i + 1] === '.') throw new ToolError(QUERY_HINT);
      i++;
      if (text[i] === '*') throw new ToolError(QUERY_HINT);
      const key = readName();
      if (key === '') fail('expected a key after "."');
      if (/\s/.test(key)) fail(`key "${key}" has a space; write it as ['${key}']`);
      segments.push(key);
    } else if (c === '[') {
      i++;
      const q = text[i];
      if (q === "'" || q === '"') {
        segments.push(readQuoted(q));
        if (text[i] !== ']') fail('expected "]" after the quoted key');
        i++;
      } else {
        const start = i;
        while (i < text.length && text[i] !== ']') i++;
        const inner = text.slice(start, i).trim();
        if (i >= text.length) fail('missing "]"');
        if (inner === '*' || inner.startsWith('?') || inner.includes(':') || inner.includes(',')) {
          throw new ToolError(QUERY_HINT);
        }
        if (!/^\d+$/.test(inner)) {
          i = start;
          fail(`"[${inner}]" is not an index; use a whole number 0 or greater, or a quoted key like ['${inner}']`);
        }
        segments.push(Number(inner));
        i++;
      }
    } else {
      fail(`unexpected "${c}"`);
    }
  }
  return segments;

  function readQuoted(q: string): string {
    i++; // opening quote
    let out = '';
    while (i < text.length && text[i] !== q) {
      if (text[i] === '\\') {
        const n = text[i + 1];
        if (n === undefined) break;
        const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '/': '/', '\\': '\\', "'": "'", '"': '"' };
        if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
          out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }
        if (!(n in map)) fail(`unknown escape "\\${n}"`);
        out += map[n];
        i += 2;
      } else {
        out += text[i++];
      }
    }
    if (i >= text.length) fail('missing closing quote');
    i++; // closing quote
    return out;
  }
}

/** RFC 6901. Segments stay strings; `resolvePath` reads digit keys as indexes inside arrays. */
function parsePointer(text: string): PathSegment[] {
  return text
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}
