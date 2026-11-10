import { defineTool } from '../core/tool';

const ENCODE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', euro: '€',
};

export const htmlTools = [
  defineTool({
    id: 'html.encode',
    category: 'HTML',
    title: 'Escape Entities',
    description: 'Escape & < > " \' as HTML entities',
    run: (input) => input.replace(/[&<>"']/g, (c) => ENCODE[c]),
  }),
  defineTool({
    id: 'html.decode',
    category: 'HTML',
    title: 'Unescape Entities',
    description: 'Decode named and numeric HTML entities',
    run: (input) =>
      input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
        if (body[0] === '#') {
          const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          return code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        return NAMED[body.toLowerCase()] ?? match;
      }),
  }),
];
