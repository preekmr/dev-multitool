/**
 * Tests the editor glue (selections, whole document, multi-cursor, output modes)
 * against a small in-memory fake of the VS Code API.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  text: '',
  selections: [] as { start: number; end: number }[],
  errors: [] as string[],
  infos: [] as string[],
  opened: [] as { content: string; language: string }[],
  runs: [] as Record<string, unknown>[],
  bugs: [] as { err: unknown; toolId: string }[],
}));

vi.mock('../src/telemetry', () => ({
  trackToolRun: (e: Record<string, unknown>) => void state.runs.push(e),
  trackBug: (err: unknown, toolId: string) => void state.bugs.push({ err, toolId }),
}));

vi.mock('vscode', () => {
  class Position {
    constructor(public offset: number) {}
  }
  class Range {
    start: Position;
    end: Position;
    constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
      if (typeof a === 'number') {
        // (line, char, line, char) — only used for "whole document"; resolve to offsets.
        const lines = state.text.split('\n');
        const off = (l: number, ch: number) => lines.slice(0, l).reduce((n, s) => n + s.length + 1, 0) + ch;
        this.start = new Position(off(a, b as number));
        this.end = new Position(off(c!, d!));
      } else {
        this.start = a;
        this.end = b as Position;
      }
    }
  }
  const document = {
    get lineCount() {
      return state.text.split('\n').length;
    },
    eol: 1,
    lineAt: (n: number) => ({ lineNumber: n, range: { end: { character: state.text.split('\n')[n].length } } }),
    getText: (r: Range) => state.text.slice(r.start.offset, r.end.offset),
  };
  const editor = {
    document,
    options: { insertSpaces: true, tabSize: 2 },
    get selections() {
      return state.selections.map((s) => ({
        start: new Position(s.start),
        end: new Position(s.end),
        isEmpty: s.start === s.end,
      }));
    },
    edit: async (cb: (b: { replace: (r: Range, t: string) => void }) => void) => {
      const edits: [Range, string][] = [];
      cb({ replace: (r, t) => edits.push([r, t]) });
      for (const [r, t] of edits.sort((x, y) => y[0].start.offset - x[0].start.offset)) {
        state.text = state.text.slice(0, r.start.offset) + t + state.text.slice(r.end.offset);
      }
      return true;
    },
  };
  return {
    Range,
    EndOfLine: { LF: 1, CRLF: 2 },
    ViewColumn: { Beside: -2 },
    window: {
      activeTextEditor: editor,
      showErrorMessage: async (m: string) => void state.errors.push(m),
      showWarningMessage: async (m: string) => void state.errors.push(m),
      showInformationMessage: async (m: string) => void state.infos.push(m),
      showTextDocument: async () => undefined,
    },
    workspace: {
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      openTextDocument: async (o: { content: string; language: string }) => void state.opened.push(o),
    },
    env: { clipboard: { writeText: async () => undefined } },
  };
});

import { runTool } from '../src/core/runner';
import { getTool } from './helpers';
import { defineTool } from '../src/core/tool';

function setDoc(text: string, ...selections: [number, number][]) {
  state.text = text;
  state.selections = (selections.length ? selections : [[0, 0]]).map(([start, end]) => ({ start, end }));
  state.errors = [];
  state.infos = [];
  state.opened = [];
  state.runs = [];
  state.bugs = [];
}

describe('runner', () => {
  beforeEach(() => setDoc(''));

  it('transforms the whole document when nothing is selected', async () => {
    setDoc('{"a":1}\n');
    await runTool(getTool('json.format'));
    expect(state.text).toBe('{\n  "a": 1\n}\n');
  });

  it('transforms each selection independently (multi-cursor)', async () => {
    setDoc('x=aGk= y=Ynll', [2, 6], [9, 13]);
    await runTool(getTool('base64.decode'));
    expect(state.text).toBe('x=hi y=bye');
  });

  it('leaves the text untouched and shows an error for invalid input', async () => {
    setDoc('{bad json}');
    await runTool(getTool('json.format'));
    expect(state.text).toBe('{bad json}');
    expect(state.errors[0]).toMatch(/^Multitool JSON Format: Invalid JSON/);
  });

  it('does not apply partial edits when one of several selections fails', async () => {
    setDoc('aGk= !!!!', [0, 4], [5, 9]);
    await runTool(getTool('base64.decode'));
    expect(state.text).toBe('aGk= !!!!');
  });

  it('inserts generated content at the cursor', async () => {
    setDoc('id: ', [4, 4]);
    await runTool(getTool('generate.uuid'));
    expect(state.text).toMatch(/^id: [0-9a-f-]{36}$/);
  });

  it('opens newDocument results in a new tab and shows message results', async () => {
    setDoc('https://x.dev/?a=1');
    await runTool(getTool('url.parse'));
    expect(state.opened[0].language).toBe('json');
    expect(state.text).toBe('https://x.dev/?a=1');

    await runTool(getTool('hash.md5'));
    expect(state.infos[0]).toMatch(/^Hash MD5: [0-9a-f]{32}$/);

    await runTool(getTool('base64.encode'), { output: 'newDocument' });
    expect(state.opened[1].content).toBe(Buffer.from('https://x.dev/?a=1').toString('base64'));
  });

  describe('telemetry', () => {
    it('reports a successful run without any of the text', async () => {
      setDoc('secret {"a":1}', [7, 14]);
      await runTool(getTool('json.minify'), { source: 'picker' });
      expect(state.runs).toEqual([
        expect.objectContaining({
          toolId: 'json.minify',
          source: 'picker',
          ranges: 1,
          wholeDocument: false,
          outputMode: 'replace',
          outcome: 'ok',
          errorType: undefined,
        }),
      ]);
      expect(JSON.stringify(state.runs)).not.toContain('secret');
      expect(state.bugs).toEqual([]);
    });

    it('reports invalid input as inputError, not as a bug', async () => {
      setDoc('{bad json}');
      await runTool(getTool('json.format'));
      expect(state.runs[0]).toMatchObject({ outcome: 'inputError', errorType: 'ToolError', wholeDocument: true });
      expect(state.bugs).toEqual([]);
    });

    it('reports an unexpected exception as a bug with the error', async () => {
      const broken = defineTool({
        id: 'test.broken',
        category: 'Test',
        title: 'Broken',
        run: () => {
          throw new TypeError('boom');
        },
      });
      setDoc('x');
      await runTool(broken);
      expect(state.runs[0]).toMatchObject({ toolId: 'test.broken', source: 'command', outcome: 'bug', errorType: 'TypeError' });
      expect(state.bugs).toEqual([{ err: expect.any(TypeError), toolId: 'test.broken' }]);
      expect(state.errors[0]).toBe('Multitool Test Broken: boom');
    });
  });
});
