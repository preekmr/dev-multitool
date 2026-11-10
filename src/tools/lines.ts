import { defineTool } from '../core/tool';
import { mapLines } from '../core/util';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const lineTools = [
  defineTool({
    id: 'lines.sort',
    category: 'Lines',
    title: 'Sort Ascending',
    description: 'Natural sort (file2 before file10)',
    run: (input, ctx) => mapLines(input, ctx, (l) => [...l].sort(collator.compare)),
  }),
  defineTool({
    id: 'lines.sortDesc',
    category: 'Lines',
    title: 'Sort Descending',
    run: (input, ctx) => mapLines(input, ctx, (l) => [...l].sort((a, b) => collator.compare(b, a))),
  }),
  defineTool({
    id: 'lines.unique',
    category: 'Lines',
    title: 'Remove Duplicates',
    description: 'Keep the first occurrence of each line',
    run: (input, ctx) => mapLines(input, ctx, (l) => [...new Set(l)]),
  }),
  defineTool({
    id: 'lines.reverse',
    category: 'Lines',
    title: 'Reverse Order',
    run: (input, ctx) => mapLines(input, ctx, (l) => [...l].reverse()),
  }),
  defineTool({
    id: 'lines.removeBlank',
    category: 'Lines',
    title: 'Remove Blank Lines',
    run: (input, ctx) => mapLines(input, ctx, (l) => l.filter((line) => line.trim() !== '')),
  }),
  defineTool({
    id: 'lines.trim',
    category: 'Lines',
    title: 'Trim Whitespace',
    description: 'Trim leading and trailing whitespace on every line',
    run: (input, ctx) => mapLines(input, ctx, (l) => l.map((line) => line.trim())),
  }),
  defineTool({
    id: 'lines.count',
    category: 'Lines',
    title: 'Count Lines, Words, Characters',
    output: 'message',
    run: (input) => {
      const lines = input === '' ? 0 : input.split(/\r?\n/).length;
      const words = input.split(/\s+/).filter(Boolean).length;
      const chars = [...input].length;
      const bytes = Buffer.byteLength(input, 'utf8');
      return `${lines} lines, ${words} words, ${chars} characters, ${bytes} bytes (UTF-8)`;
    },
  }),
];
