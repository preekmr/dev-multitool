import { defineTool, type Tool } from '../core/tool';

/** Splits "helloWorld", "Hello_world", "hello-world", "HTTPServer" into words. */
export function words(input: string): string[] {
  return input
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** Applies the conversion per line so multi-line selections convert each identifier. */
function perLine(fn: (input: string) => string) {
  return (input: string) =>
    input
      .split(/(\r?\n)/)
      .map((part, i) => (i % 2 === 1 ? part : part.replace(/^(\s*)(.*?)(\s*)$/s, (_m, a, body: string, b) => a + (body ? fn(body) : '') + b)))
      .join('');
}

const conversions: [string, string, string, (s: string) => string][] = [
  ['camel', 'camelCase', 'helloWorld', (s) => words(s).map((w, i) => (i === 0 ? w.toLowerCase() : cap(w))).join('')],
  ['pascal', 'PascalCase', 'HelloWorld', (s) => words(s).map(cap).join('')],
  ['snake', 'snake_case', 'hello_world', (s) => words(s).map((w) => w.toLowerCase()).join('_')],
  ['constant', 'CONSTANT_CASE', 'HELLO_WORLD', (s) => words(s).map((w) => w.toUpperCase()).join('_')],
  ['kebab', 'kebab-case', 'hello-world', (s) => words(s).map((w) => w.toLowerCase()).join('-')],
  ['title', 'Title Case', 'Hello World', (s) => words(s).map(cap).join(' ')],
];

export const caseTools: Tool[] = [
  ...conversions.map(([id, label, example, fn]) =>
    defineTool({
      id: `case.${id}`,
      category: 'Case',
      title: `to ${label}`,
      description: `Convert each line to ${label} (${example})`,
      run: perLine(fn),
    }),
  ),
  defineTool({
    id: 'case.upper',
    category: 'Case',
    title: 'to UPPERCASE',
    description: 'Convert text to upper case',
    run: (input) => input.toUpperCase(),
  }),
  defineTool({
    id: 'case.lower',
    category: 'Case',
    title: 'to lowercase',
    description: 'Convert text to lower case',
    run: (input) => input.toLowerCase(),
  }),
];
