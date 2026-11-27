/**
 * Maps between offsets in a JSON document and paths to its values.
 * Pure: no `vscode` import. Uses jsonc-parser, which tolerates comments, trailing commas and
 * half-written JSON, so the answers stay useful while the user is typing.
 *
 * Offsets are string indexes (UTF-16 code units), which is what `TextDocument.offsetAt` returns.
 */
import { findNodeAtOffset, parseTree, type Node, type ParseError } from 'jsonc-parser';
import { describePath, type PathSegment } from './path';

export interface OffsetRange {
  offset: number;
  length: number;
}

export interface ArrayInfo {
  /** Number of items in the array. */
  count: number;
  /** Path of the array itself. */
  path: PathSegment[];
  /** From `[` to `]`. */
  range: OffsetRange;
}

export interface ArrayLocation {
  /** Offset of the array's `[`. */
  openBracketOffset: number;
  count: number;
}

export type ResolveResult =
  | ({ found: true } & OffsetRange)
  | {
      found: false;
      /** Why, in words, e.g. `$.users has 3 items`. */
      reason: string;
      /** How many leading segments did resolve. */
      resolved: number;
    };

export interface ParsedJson {
  root: Node | undefined;
  errors: ParseError[];
}

export function parseJson(text: string): ParsedJson {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { allowTrailingComma: true, disallowComments: false });
  return { root, errors };
}

/** True when the whole text is one JSON value (comments and trailing commas allowed). */
export function isJson(text: string): boolean {
  const { root, errors } = parseJson(text);
  return root !== undefined && errors.length === 0;
}

/** Path from the root to `node`. A property node stands for its value. */
function pathOf(node: Node): PathSegment[] {
  const path: PathSegment[] = [];
  let n: Node | undefined = node;
  while (n?.parent) {
    const parent: Node = n.parent;
    if (n.type === 'property') {
      const key = n.children?.[0];
      if (key) path.push(String(key.value));
    } else if (parent.type === 'array') {
      path.push(parent.children!.indexOf(n));
    }
    // A key or value node inside a property: the property adds the key on the next step.
    n = parent;
  }
  return path.reverse();
}

/** The value node at `offset`: on a key or on `:` that's the property's value. */
function valueNodeAt(root: Node, offset: number): Node | undefined {
  let node = findNodeAtOffset(root, offset, true);
  if (!node) return undefined;
  if (node.parent?.type === 'property' && node.parent.children?.[0] === node) node = node.parent;
  if (node.type === 'property') return node.children?.[1] ?? node;
  return node;
}

/**
 * Path of the value at `offset`. On a key (or its colon) it is the path of that key's value; on
 * brackets, commas or whitespace between items it is the path of the enclosing object or array.
 * Returns null when the text holds no JSON value at all.
 */
export function pathAtOffset(text: string, offset: number): PathSegment[] | null {
  const { root } = parseJson(text);
  if (!root) return null;
  const node = valueNodeAt(root, offset);
  return node ? pathOf(node) : [];
}

/** Child of an object or array for one path segment. Duplicate keys: the last one wins, as in JSON.parse. */
function child(node: Node, segment: PathSegment): Node | undefined {
  if (node.type === 'array') {
    const index = typeof segment === 'number' ? segment : /^\d+$/.test(segment) ? Number(segment) : NaN;
    return Number.isInteger(index) ? node.children?.[index] : undefined;
  }
  if (node.type === 'object' && typeof segment === 'string') {
    let match: Node | undefined;
    for (const prop of node.children ?? []) {
      const [key, value] = prop.children ?? [];
      if (key && value && key.value === segment) match = value;
    }
    return match;
  }
  return undefined;
}

const KIND: Record<string, string> = {
  string: 'a string',
  number: 'a number',
  boolean: 'a boolean',
  null: 'null',
  object: 'an object',
  array: 'an array',
};

/** Finds the value at `segments`, or says where the path stops matching. */
export function resolvePath(text: string, segments: readonly PathSegment[]): ResolveResult {
  const { root } = parseJson(text);
  if (!root) return { found: false, reason: 'the document has no JSON value', resolved: 0 };
  let node = root;
  for (let i = 0; i < segments.length; i++) {
    const next = child(node, segments[i]);
    if (!next) {
      const at = describePath(segments.slice(0, i));
      const seg = segments[i];
      let reason: string;
      if (node.type === 'array') {
        const n = node.children?.length ?? 0;
        reason = `${at} is an array with ${n} ${n === 1 ? 'item' : 'items'}`;
        if (typeof seg === 'string' && !/^\d+$/.test(seg)) reason += `, so it has no key "${seg}"`;
      } else if (node.type === 'object') {
        reason = typeof seg === 'number' ? `${at} is an object, not an array` : `${at} has no key ${JSON.stringify(seg)}`;
      } else {
        reason = `${at} is ${KIND[node.type] ?? node.type}, not an object or array`;
      }
      return { found: false, reason, resolved: i };
    }
    node = next;
  }
  return { found: true, offset: node.offset, length: node.length };
}

/** Range of the value at `segments`, or null when there is none. */
export function rangeForPath(text: string, segments: readonly PathSegment[]): OffsetRange | null {
  const r = resolvePath(text, segments);
  return r.found ? { offset: r.offset, length: r.length } : null;
}

/**
 * The closest array that holds `offset`. On a key whose value is an array, that array.
 * Returns null when the offset is not inside an array.
 */
export function arrayInfoAt(text: string, offset: number): ArrayInfo | null {
  const { root } = parseJson(text);
  if (!root) return null;
  let node = valueNodeAt(root, offset);
  while (node && node.type !== 'array') node = node.parent;
  if (!node) return null;
  return { count: node.children?.length ?? 0, path: pathOf(node), range: { offset: node.offset, length: node.length } };
}

/** Every array in the document, in document order. */
export function collectArrays(text: string): ArrayLocation[] {
  const { root } = parseJson(text);
  const out: ArrayLocation[] = [];
  const visit = (node: Node) => {
    if (node.type === 'array') out.push({ openBracketOffset: node.offset, count: node.children?.length ?? 0 });
    node.children?.forEach(visit);
  };
  if (root) visit(root);
  return out;
}
