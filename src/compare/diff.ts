/**
 * Structural JSON comparison, formatting with a path → line map, and report rendering.
 * Pure functions: no `vscode` import, so everything here is unit-tested with plain Node.
 */
import { parse as parseJsonc, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { ToolError } from '../core/tool';
import { describePosition } from '../core/util';

export type PathSegment = string | number;
export type ChangeKind = 'added' | 'removed' | 'changed';
export type ValueType = 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean';

export interface JsonChange {
  kind: ChangeKind;
  path: PathSegment[];
  /** Value on the left side (absent for 'added'). */
  oldValue?: unknown;
  /** Value on the right side (absent for 'removed'). */
  newValue?: unknown;
  /** For 'changed': the two values have different JSON types, e.g. string → number. */
  typeChanged?: boolean;
}

export interface DiffOptions {
  /** Compare and list object keys in sorted order (default true). */
  sortKeys?: boolean;
}

// ---------------------------------------------------------------- parsing

export interface ParsedDocument {
  value: unknown;
  /** True when the text needed the JSON-with-comments parser (comments or trailing commas). */
  jsonc: boolean;
}

function humanize(code: string): string {
  const words = code.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Parses a whole document as JSON. Falls back to JSON with comments / trailing commas
 * (tsconfig.json, settings.json, …). `label` names the side in error messages.
 */
export function parseDocument(text: string, label: string): ParsedDocument {
  const body = text.replace(/^﻿/, '');
  if (body.trim() === '') throw new ToolError(`${label} is empty.`);
  try {
    return { value: JSON.parse(body), jsonc: false };
  } catch {
    // fall through to the tolerant parser
  }
  const errors: ParseError[] = [];
  const value: unknown = parseJsonc(body, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length === 0) return { value, jsonc: true };
  const first = errors[0];
  throw new ToolError(
    `${label}: Invalid JSON (${describePosition(body, first.offset)}): ${humanize(printParseErrorCode(first.error))}.`,
  );
}

// ---------------------------------------------------------------- paths

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** `$.user.roles[2]`, `$["key with space"]` */
export function formatPath(path: readonly PathSegment[]): string {
  let out = '$';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else if (IDENTIFIER.test(seg)) out += `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

// ---------------------------------------------------------------- diff

export function valueType(v: unknown): ValueType {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v as ValueType;
}

const isObject = (v: unknown): v is Record<string, unknown> => valueType(v) === 'object';

/** Same ordering as the "JSON Sort Keys" tool. */
export const compareKeys = (a: string, b: string) => a.localeCompare(b);

function orderedKeys(left: Record<string, unknown>, right: Record<string, unknown>, sortKeys: boolean): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const list = [...keys];
  return sortKeys ? list.sort(compareKeys) : list;
}

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Lists the differences between two parsed JSON values, in document order.
 * Arrays are compared item by item, by position. `null` and a missing key are different;
 * numbers compare by value (1 and 1.0 are equal).
 */
export function diffJson(left: unknown, right: unknown, options: DiffOptions = {}): JsonChange[] {
  const sortKeys = options.sortKeys ?? true;
  const changes: JsonChange[] = [];

  const walk = (a: unknown, b: unknown, path: PathSegment[]): void => {
    const ta = valueType(a);
    const tb = valueType(b);
    if (ta === 'array' && tb === 'array') {
      const la = a as unknown[];
      const lb = b as unknown[];
      const n = Math.max(la.length, lb.length);
      for (let i = 0; i < n; i++) {
        const p = [...path, i];
        if (i >= la.length) changes.push({ kind: 'added', path: p, newValue: lb[i] });
        else if (i >= lb.length) changes.push({ kind: 'removed', path: p, oldValue: la[i] });
        else walk(la[i], lb[i], p);
      }
      return;
    }
    if (ta === 'object' && tb === 'object') {
      const oa = a as Record<string, unknown>;
      const ob = b as Record<string, unknown>;
      for (const key of orderedKeys(oa, ob, sortKeys)) {
        const p = [...path, key];
        if (!has(oa, key)) changes.push({ kind: 'added', path: p, newValue: ob[key] });
        else if (!has(ob, key)) changes.push({ kind: 'removed', path: p, oldValue: oa[key] });
        else walk(oa[key], ob[key], p);
      }
      return;
    }
    if (ta !== tb) {
      changes.push({ kind: 'changed', path, oldValue: a, newValue: b, typeChanged: true });
    } else if (a !== b) {
      changes.push({ kind: 'changed', path, oldValue: a, newValue: b });
    }
  };

  walk(left, right, []);
  return changes;
}

export interface DiffSummary {
  changed: number;
  added: number;
  removed: number;
  total: number;
}

export function summarize(changes: readonly JsonChange[]): DiffSummary {
  const s = { changed: 0, added: 0, removed: 0, total: changes.length };
  for (const c of changes) s[c.kind]++;
  return s;
}

/** "3 changed · 2 added · 1 removed" (zero counts omitted), or "No differences". */
export function summaryText(s: DiffSummary): string {
  const parts = [
    s.changed ? `${s.changed} changed` : '',
    s.added ? `${s.added} added` : '',
    s.removed ? `${s.removed} removed` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No differences';
}

// ---------------------------------------------------------------- formatting

export interface FormattedJson {
  text: string;
  /** formatPath(path) → 0-based line where that value (or its key) starts. */
  lineOf: Map<string, number>;
}

/**
 * Pretty-prints like JSON.stringify(value, null, indent) — optionally with sorted keys — and
 * records the line of every value so a change can be revealed in the diff editor.
 */
export function formatJson(value: unknown, indent: string, sortKeys: boolean): FormattedJson {
  const lines: string[] = [];
  const lineOf = new Map<string, number>();

  const write = (v: unknown, path: PathSegment[], lead: string, depth: number, trail: string): void => {
    lineOf.set(formatPath(path), lines.length);
    const closePad = indent.repeat(depth);
    const childPad = indent.repeat(depth + 1);
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${lead}[]${trail}`);
        return;
      }
      lines.push(`${lead}[`);
      v.forEach((item, i) => write(item, [...path, i], childPad, depth + 1, i < v.length - 1 ? ',' : ''));
      lines.push(`${closePad}]${trail}`);
      return;
    }
    if (isObject(v)) {
      const keys = Object.keys(v);
      if (sortKeys) keys.sort(compareKeys);
      if (keys.length === 0) {
        lines.push(`${lead}{}${trail}`);
        return;
      }
      lines.push(`${lead}{`);
      keys.forEach((k, i) =>
        write(v[k], [...path, k], `${childPad}${JSON.stringify(k)}: `, depth + 1, i < keys.length - 1 ? ',' : ''),
      );
      lines.push(`${closePad}}${trail}`);
      return;
    }
    lines.push(`${lead}${JSON.stringify(v)}${trail}`);
  };

  write(value, [], '', 0, '');
  return { text: lines.join('\n') + '\n', lineOf };
}

// ---------------------------------------------------------------- report

/** Compact one-line preview of a value, e.g. `"admin"`, `{"a":1,…}`. */
export function previewValue(v: unknown, max = 60): string {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const KIND_SYMBOL: Record<ChangeKind, string> = { changed: '~', added: '+', removed: '−' };

/** One-line description for the report: `"a" → "b"`, `+ "x"`, `− 3`. */
export function describeChange(c: JsonChange): string {
  if (c.kind === 'added') return `+ ${previewValue(c.newValue)}`;
  if (c.kind === 'removed') return `− ${previewValue(c.oldValue)}`;
  const arrow = `${previewValue(c.oldValue, 40)} → ${previewValue(c.newValue, 40)}`;
  return c.typeChanged ? `${arrow}  (${valueType(c.oldValue)} → ${valueType(c.newValue)})` : arrow;
}

function codeSpan(text: string): string {
  const escaped = text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return escaped.includes('`') ? `\`\` ${escaped} \`\`` : `\`${escaped}\``;
}

export const MARKDOWN_MAX_ROWS = 500;

/** A Markdown table for pasting into a PR or ticket. */
export function renderMarkdown(changes: readonly JsonChange[], leftName: string, rightName: string): string {
  const out = [`**JSON diff:** ${codeSpan(leftName)} → ${codeSpan(rightName)}`, '', summaryText(summarize(changes))];
  if (changes.length === 0) return out.join('\n') + '\n';
  out.push('', '| | Path | Before | After |', '| --- | --- | --- | --- |');
  for (const c of changes.slice(0, MARKDOWN_MAX_ROWS)) {
    const before = c.kind === 'added' ? '' : codeSpan(previewValue(c.oldValue, 80));
    const after = c.kind === 'removed' ? '' : codeSpan(previewValue(c.newValue, 80));
    out.push(`| ${KIND_SYMBOL[c.kind]} ${c.kind} | ${codeSpan(formatPath(c.path))} | ${before} | ${after} |`);
  }
  if (changes.length > MARKDOWN_MAX_ROWS) out.push('', `…and ${changes.length - MARKDOWN_MAX_ROWS} more changes.`);
  return out.join('\n') + '\n';
}
