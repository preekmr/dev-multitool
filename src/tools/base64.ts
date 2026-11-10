import { defineTool, ToolError } from '../core/tool';
import { decodeUtf8 } from '../core/util';

function decode(input: string, alphabet: RegExp, encoding: 'base64' | 'base64url'): string {
  const clean = input.replace(/\s+/g, '');
  if (clean.length === 0) return '';
  if (!alphabet.test(clean)) throw new ToolError(`Input is not valid ${encoding === 'base64' ? 'Base64' : 'Base64URL'}.`);
  return decodeUtf8(Buffer.from(clean, encoding), 'Decoded data');
}

export const base64Tools = [
  defineTool({
    id: 'base64.encode',
    category: 'Base64',
    title: 'Encode',
    description: 'Encode text (UTF-8) as Base64',
    run: (input) => Buffer.from(input, 'utf8').toString('base64'),
  }),
  defineTool({
    id: 'base64.decode',
    category: 'Base64',
    title: 'Decode',
    description: 'Decode Base64 to text (UTF-8)',
    run: (input) => decode(input, /^[A-Za-z0-9+/]+={0,2}$/, 'base64'),
  }),
  defineTool({
    id: 'base64.urlEncode',
    category: 'Base64',
    title: 'URL-safe Encode',
    description: 'Encode text as Base64URL (no padding, - and _)',
    run: (input) => Buffer.from(input, 'utf8').toString('base64url'),
  }),
  defineTool({
    id: 'base64.urlDecode',
    category: 'Base64',
    title: 'URL-safe Decode',
    description: 'Decode Base64URL to text',
    run: (input) => decode(input, /^[A-Za-z0-9_-]+={0,2}$/, 'base64url'),
  }),
];
