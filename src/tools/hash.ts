import { createHash } from 'node:crypto';
import { defineTool } from '../core/tool';

const algorithms = [
  ['md5', 'MD5'],
  ['sha1', 'SHA-1'],
  ['sha256', 'SHA-256'],
  ['sha512', 'SHA-512'],
] as const;

export const hashTools = algorithms.map(([algorithm, label]) =>
  defineTool({
    id: `hash.${algorithm}`,
    category: 'Hash',
    title: label,
    description: `${label} hex digest of the text (UTF-8)`,
    output: 'message',
    run: (input) => createHash(algorithm).update(input, 'utf8').digest('hex'),
  }),
);
