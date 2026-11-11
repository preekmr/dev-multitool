/**
 * Feeds awkward input to every tool. A tool may reject input, but only with ToolError:
 * any other exception would be reported as a bug by telemetry, so catch it here first.
 */
import { describe, expect, it } from 'vitest';
import { tools } from '../src/tools';
import { DEFAULT_CONTEXT, ToolError } from '../src/core/tool';

const INPUTS = [
  '',
  ' ',
  '\n\n',
  'not valid for anything {[<',
  '{"a":',
  '<a><b></a>',
  '%E0%A4%A',
  'a.b.c',
  '-1',
  '1e400',
  'null',
  '[]',
  '"\\ud800"',
  '\ud800',
  '\u0000\u0001\u001f',
  '😀 ünïcödé 中文',
  'x'.repeat(10_000),
  '\r\n\r\n',
];

describe('every tool fails only with ToolError', () => {
  for (const tool of tools.filter((t) => t.input !== 'none')) {
    it(tool.id, async () => {
      for (const input of INPUTS) {
        try {
          const out = await tool.run(input, DEFAULT_CONTEXT);
          expect(typeof out).toBe('string');
        } catch (err) {
          if (!(err instanceof ToolError)) {
            throw new Error(`${tool.id} threw ${(err as Error)?.name} for input ${JSON.stringify(input.slice(0, 40))}: ${(err as Error)?.message}`);
          }
        }
      }
    });
  }
});
