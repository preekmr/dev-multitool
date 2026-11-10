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

function setDoc(text: string, ...selections: [number, number][]) {
  state.text = text;
  state.selections = (selections.length ? selections : [[0, 0]]).map(([start, end]) => ({ start, end }));
  state.errors = [];
  state.infos = [];
  state.opened = [];
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
});
