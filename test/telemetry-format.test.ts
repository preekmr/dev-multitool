import { describe, expect, it } from 'vitest';
import { cleanProperties, errorType, exceptionProperties, parseStack } from '../src/core/telemetry-format';

const ROOT = '/Users/jane/.vscode/extensions/preekmr.dev-multitool-0.2.0';

const stack = [
  'TypeError: Cannot read properties of undefined (reading "secret user text")',
  `    at run (${ROOT}/dist/extension.js:12:34)`,
  `    at async runTool (${ROOT}/dist/extension.js:56:7)`,
  '    at /Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:1:2',
  '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
].join('\n');

describe('parseStack', () => {
  it('keeps extension frames relative and hides every other path, oldest call first', () => {
    const frames = parseStack(stack, ROOT);
    expect(frames.map((f) => f.filename)).toEqual(['<external>', '<external>', 'dist/extension.js', 'dist/extension.js']);
    expect(frames[3]).toMatchObject({ function: 'run', lineno: 12, colno: 34, in_app: true });
    expect(frames[2]).toMatchObject({ function: 'runTool', in_app: true });
    expect(frames[0]).toMatchObject({ lineno: undefined, in_app: false });
    expect(JSON.stringify(frames)).not.toContain('jane');
  });

  it('handles Windows paths', () => {
    const root = 'C:\\Users\\jane\\.vscode\\extensions\\preekmr.dev-multitool-0.2.0';
    const frames = parseStack(`Error\n    at run (${root}\\dist\\extension.js:1:2)`, root);
    expect(frames).toEqual([expect.objectContaining({ filename: 'dist/extension.js', in_app: true })]);
  });

  it('returns no frames for a missing stack', () => {
    expect(parseStack(undefined, ROOT)).toEqual([]);
  });
});

describe('exceptionProperties', () => {
  it('sends the error type but never the message', () => {
    const err = new TypeError('secret user text');
    err.stack = stack;
    const props = exceptionProperties(err, ROOT);
    const json = JSON.stringify(props);
    expect(json).not.toContain('secret');
    expect(json).not.toContain('jane');
    expect(props.$exception_list).toEqual([
      expect.objectContaining({ type: 'TypeError', value: 'TypeError', stacktrace: expect.objectContaining({ type: 'raw' }) }),
    ]);
  });

  it('names non-Error throws by their type', () => {
    expect(errorType('oops')).toBe('string');
  });
});

describe('cleanProperties', () => {
  it('keeps primitives and drops paths, objects and empty values', () => {
    expect(
      cleanProperties({
        toolId: 'json.format',
        ranges: 2,
        wholeDocument: false,
        'common.vscodeversion': '1.95.0',
        file: '/Users/jane/project/secret.json',
        winFile: 'C:\\Users\\jane\\a.json',
        nested: { a: 1 },
        missing: undefined,
      }),
    ).toEqual({ toolId: 'json.format', ranges: 2, wholeDocument: false, 'common.vscodeversion': '1.95.0' });
  });
});
