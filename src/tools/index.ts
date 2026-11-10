/**
 * The tool registry. To add a tool:
 *   1. Create or extend a file in this folder with `defineTool({...})`.
 *   2. Add its export to the list below (new files only).
 *   3. Run `npm run sync` to regenerate the commands in package.json.
 * See CONTRIBUTING.md for details.
 */
import type { Tool } from '../core/tool';
import { base64Tools } from './base64';
import { caseTools } from './case';
import { generateTools } from './generate';
import { hashTools } from './hash';
import { hexTools } from './hex';
import { htmlTools } from './html';
import { jsonTools } from './json';
import { jwtTools } from './jwt';
import { lineTools } from './lines';
import { timeTools } from './time';
import { urlTools } from './url';
import { xmlTools } from './xml';
import { yamlTools } from './yaml';

export const tools: readonly Tool[] = [
  ...jsonTools,
  ...xmlTools,
  ...yamlTools,
  ...base64Tools,
  ...urlTools,
  ...jwtTools,
  ...hashTools,
  ...htmlTools,
  ...hexTools,
  ...caseTools,
  ...lineTools,
  ...timeTools,
  ...generateTools,
];
