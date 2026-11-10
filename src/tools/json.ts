import { stringify as toYaml } from 'yaml';
import { defineTool, ToolError } from '../core/tool';
import { indentString, jsonFragment, parseJson, transformJsonFragment } from '../core/util';

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export const jsonTools = [
  defineTool({
    id: 'json.format',
    category: 'JSON',
    title: 'Format',
    description: 'Pretty-print JSON using the editor indentation',
    run: (input, ctx) => transformJsonFragment(input, ctx, (v) => JSON.stringify(v, null, indentString(ctx))),
  }),
  defineTool({
    id: 'json.minify',
    category: 'JSON',
    title: 'Minify',
    description: 'Remove all insignificant whitespace',
    run: (input, ctx) => transformJsonFragment(input, ctx, (v) => JSON.stringify(v)),
  }),
  defineTool({
    id: 'json.sortKeys',
    category: 'JSON',
    title: 'Sort Keys',
    description: 'Sort object keys alphabetically (recursively) and pretty-print',
    run: (input, ctx) =>
      transformJsonFragment(input, ctx, (v) => JSON.stringify(sortKeysDeep(v), null, indentString(ctx))),
  }),
  defineTool({
    id: 'json.validate',
    category: 'JSON',
    title: 'Validate',
    description: 'Check whether the text is valid JSON',
    output: 'message',
    run: (input) => {
      const value = parseJson(jsonFragment(input).body);
      const kind = Array.isArray(value) ? `array of ${value.length}` : value === null ? 'null' : typeof value;
      return `valid JSON (${kind})`;
    },
  }),
  defineTool({
    id: 'json.stringify',
    category: 'JSON',
    title: 'Escape (Stringify)',
    description: 'Turn text into a JSON string literal: {"a":1} → "{\\"a\\":1}"',
    run: (input) => JSON.stringify(input),
  }),
  defineTool({
    id: 'json.unstringify',
    category: 'JSON',
    title: 'Unescape (Parse String)',
    description: 'Turn a JSON string literal back into its text',
    run: (input) => {
      const value = parseJson(input.trim());
      if (typeof value !== 'string') throw new ToolError('Expected a JSON string literal, e.g. "{\\"a\\":1}".');
      return value;
    },
  }),
  defineTool({
    id: 'json.toYaml',
    category: 'JSON',
    title: 'to YAML',
    description: 'Convert JSON to YAML',
    run: (input, ctx) => toYaml(parseJson(jsonFragment(input).body), { indent: ctx.indent === '\t' ? 2 : ctx.indent }),
  }),
];
