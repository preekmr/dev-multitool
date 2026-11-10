import { defineTool, ToolError } from '../core/tool';
import { decodeUtf8 } from '../core/util';

export const hexTools = [
  defineTool({
    id: 'hex.encode',
    category: 'Hex',
    title: 'Encode',
    description: 'Text (UTF-8) to hexadecimal bytes',
    run: (input) => Buffer.from(input, 'utf8').toString('hex'),
  }),
  defineTool({
    id: 'hex.decode',
    category: 'Hex',
    title: 'Decode',
    description: 'Hexadecimal bytes to text (accepts spaces, 0x and : separators)',
    run: (input) => {
      const clean = input.replace(/0x/gi, '').replace(/[\s:,-]/g, '');
      if (!/^([0-9a-f]{2})*$/i.test(clean)) throw new ToolError('Input is not an even-length hexadecimal string.');
      return decodeUtf8(Buffer.from(clean, 'hex'), 'Decoded data');
    },
  }),
];
