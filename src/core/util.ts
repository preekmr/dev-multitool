import { ToolError, type ToolContext } from './tool';

/** Indentation value accepted by JSON.stringify and friends. */
export function indentString(ctx: ToolContext): string {
  return ctx.indent === '\t' ? '\t' : ' '.repeat(ctx.indent);
}

/** Converts a character offset into a 1-based "line X, column Y" string. */
export function describePosition(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - before.lastIndexOf('\n');
  return `line ${line}, column ${column}`;
}

/** JSON.parse with an error message that points at the line and column. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const match = /position (\d+)/.exec(raw);
    const where = match ? ` (${describePosition(text, Number(match[1]))})` : '';
    let message = raw.replace(/\s*\(line \d+ column \d+\)$/, '').replace(/\s*(in JSON )?at position \d+/, '');
    if (/after JSON/.test(raw)) {
      message += ' — the text contains more than one JSON value. Select a single object, array or value.';
    }
    throw new ToolError(`Invalid JSON${where}: ${message}`);
  }
}

/**
 * A JSON value cut out of a larger document, e.g. one element of an array selected
 * together with its trailing comma:  `{ ... },`
 */
export interface JsonFragment {
  /** Whitespace before the value. */
  leading: string;
  /** The JSON value itself. */
  body: string;
  /** A trailing comma and/or whitespace after the value. */
  trailing: string;
  /** Indentation of the value's last line — used to keep pretty-printed output aligned. */
  baseIndent: string;
}

export function jsonFragment(input: string): JsonFragment {
  const leading = /^\s*/.exec(input)![0];
  const rest = input.slice(leading.length);
  const trailing = /\s*(,\s*)?$/.exec(rest)![0];
  const body = rest.slice(0, rest.length - trailing.length);
  const lastLine = /\n([ \t]*)[^\n]*$/.exec(body);
  return { leading, body, trailing, baseIndent: lastLine ? lastLine[1] : '' };
}

/**
 * Runs a JSON transform on a selection that may carry surrounding whitespace and a trailing comma,
 * and puts them back afterwards. Multi-line output is re-indented to the selection's indentation.
 */
export function transformJsonFragment(input: string, ctx: ToolContext, fn: (value: unknown) => string): string {
  const { leading, body, trailing, baseIndent } = jsonFragment(input);
  const out = fn(parseJson(body)).replace(/\n/g, ctx.eol + baseIndent);
  return leading + out + trailing;
}

/** Splits text into lines, remembering whether it ended with a newline. */
export function splitLines(text: string): { lines: string[]; trailingNewline: boolean } {
  const trailingNewline = /\r?\n$/.test(text);
  const body = trailingNewline ? text.replace(/\r?\n$/, '') : text;
  return { lines: body.split(/\r?\n/), trailingNewline };
}

export function joinLines(lines: string[], trailingNewline: boolean, ctx: ToolContext): string {
  return lines.join(ctx.eol) + (trailingNewline ? ctx.eol : '');
}

/** Applies a line-level transform while keeping the document's EOL and final newline. */
export function mapLines(text: string, ctx: ToolContext, fn: (lines: string[]) => string[]): string {
  const { lines, trailingNewline } = splitLines(text);
  return joinLines(fn(lines), trailingNewline, ctx);
}

const fatalDecoder = new TextDecoder('utf-8', { fatal: true });

/** Decodes bytes as UTF-8, failing loudly instead of producing replacement characters. */
export function decodeUtf8(bytes: Uint8Array, what: string): string {
  try {
    return fatalDecoder.decode(bytes);
  } catch {
    throw new ToolError(`${what} does not decode to valid UTF-8 text.`);
  }
}
