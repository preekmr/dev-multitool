import { randomUUID } from 'node:crypto';
import { defineTool } from '../core/tool';

export const generateTools = [
  defineTool({
    id: 'generate.uuid',
    category: 'Generate',
    title: 'UUID v4',
    description: 'Insert a random UUID at each cursor',
    input: 'none',
    run: () => randomUUID(),
  }),
];
