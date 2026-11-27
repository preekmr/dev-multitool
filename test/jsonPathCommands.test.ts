/**
 * Tests the JSON Path commands (Copy Path at Cursor, Go to Path…, Count Array Items)
 * against a small in-memory fake of the VS Code API.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  editor: undefined as
    | undefined
    | {
        document: { languageId: string; getText(): string; offsetAt(p: unknown): number; positionAt(o: number): unknown };
        selections: unknown[];
        selection: unknown;
        revealed?: unknown[];
        decorations: unknown[][];
        setDecorations(type: unknown, ranges: unknown[]): void;
        revealRange(range: unknown, how: unknown): void;
      },
  infos: [] as string[],
  infoPick: undefined as undefined | string,
  warnings: [] as string[],
  errors: [] as string[],
  status: [] as string[],
  clipboard: '',
  input: undefined as undefined | string,
  inputOptions: undefined as undefined | { value?: string; validateInput?(v: string): string | undefined },
  config: {} as Record<string, unknown>,
  runs: [] as Record<string, unknown>[],
  bugs: [] as unknown[],
}));

vi.mock('../src/telemetry', () => ({
  trackToolRun: (e: Record<string, unknown>) => s.runs.push(e),
  trackBug: (err: unknown) => s.bugs.push(err),
}));

vi.mock('vscode', () => {
  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
    compareTo(o: Position) {
      return this.line - o.line || this.character - o.character;
    }
  }
  class Range {
    constructor(
      public start: Position,
      public end: Position,
    ) {}
    get isEmpty() {
      return this.start.compareTo(this.end) === 0;
    }
  }
  class Selection extends Range {
    constructor(
      public anchor: Position,
      public active: Position,
    ) {
      super(anchor.compareTo(active) <= 0 ? anchor : active, anchor.compareTo(active) <= 0 ? active : anchor);
    }
  }
  return {
    Position,
    Range,
    Selection,
    ThemeColor: class {
      constructor(public id: string) {}
    },
    TextEditorRevealType: { InCenter: 2 },
    window: {
      get activeTextEditor() {
        return s.editor;
      },
      createTextEditorDecorationType: () => ({ dispose() {} }),
      showInformationMessage: async (m: string) => {
        s.infos.push(m);
        return s.infoPick;
      },
      showWarningMessage: async (m: string) => void s.warnings.push(m),
      showErrorMessage: async (m: string) => void s.errors.push(m),
      setStatusBarMessage: (m: string) => {
        s.status.push(m);
        return { dispose() {} };
      },
      showInputBox: async (o: typeof s.inputOptions) => {
        s.inputOptions = o;
        return s.input;
      },
    },
    workspace: {
      getConfiguration: () => ({ get: (k: string, d: unknown) => (k in s.config ? s.config[k] : d) }),
    },
    commands: {
      registerCommand: (id: string, fn: (...args: unknown[]) => unknown) => {
        s.commands.set(id, fn);
        return { dispose() {} };
      },
    },
    env: {
      clipboard: {
        writeText: async (t: string) => {
          s.clipboard = t;
        },
      },
    },
  };
});

import * as vscode from 'vscode';
import { registerJsonPath } from '../src/features/json';
import { JSON_PATH } from '../src/features/json/commands';

/** A fake editor on `marked`, with a cursor at every `|` (or a selection between `«` and `»`). */
function open(marked: string, languageId = 'json') {
  const cursors: number[] = [];
  let text = '';
  const ranges: [number, number][] = [];
  let selStart = -1;
  for (const ch of marked) {
    if (ch === '|') cursors.push(text.length);
    else if (ch === '«') selStart = text.length;
    else if (ch === '»') ranges.push([selStart, text.length]);
    else text += ch;
  }
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const positionAt = (o: number) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= o) line++;
    return new vscode.Position(line, o - lineStarts[line]);
  };
  const offsetAt = (p: vscode.Position) => lineStarts[p.line] + p.character;
  const selections = [
    ...cursors.map((o) => new vscode.Selection(positionAt(o), positionAt(o))),
    ...ranges.map(([a, b]) => new vscode.Selection(positionAt(a), positionAt(b))),
  ];
  s.editor = {
    document: { languageId, getText: () => text, offsetAt: offsetAt as (p: unknown) => number, positionAt },
    selections,
    selection: selections[0],
    decorations: [],
    setDecorations(_t, r) {
      this.decorations.push(r);
    },
    revealRange(range) {
      this.revealed = [range];
    },
  };
  return { text, offsetAt };
}

const cmd = (id: string) => s.commands.get(id)!();
/** Selected text in the fake editor. */
function selectedText(text: string, offsetAt: (p: vscode.Position) => number): string {
  const sel = s.editor!.selection as vscode.Selection;
  return text.slice(offsetAt(sel.start), offsetAt(sel.end));
}

beforeEach(() => {
  Object.assign(s, {
    commands: new Map(),
    editor: undefined,
    infos: [],
    infoPick: undefined,
    warnings: [],
    errors: [],
    status: [],
    clipboard: '',
    input: undefined,
    inputOptions: undefined,
    config: {},
    runs: [],
    bugs: [],
  });
  registerJsonPath({ subscriptions: [] } as unknown as vscode.ExtensionContext);
});

describe('JSON Copy Path at Cursor', () => {
  it('copies the path at the cursor', async () => {
    open('{"users": [{"name": "A|nn"}]}');
    await cmd(JSON_PATH.copyPath);
    expect(s.clipboard).toBe('$.users[0].name');
    expect(s.status).toEqual(['$(copy) Copied $.users[0].name']);
    expect(s.runs).toMatchObject([{ toolId: 'json.copyPath', outcome: 'ok', ranges: 1 }]);
  });

  it('multi-cursor: one path per line, in document order', async () => {
    open('{"b": [1, |2], "a-b": |true, "c": {"d": |null}}');
    // Cursors created out of order still copy in document order.
    s.editor!.selections.reverse();
    await cmd(JSON_PATH.copyPath);
    expect(s.clipboard).toBe("$.b[1]\n$['a-b']\n$.c.d");
    expect(s.status).toEqual(['$(copy) Copied 3 paths']);
  });

  it('follows the path style setting', async () => {
    open('{"users": [{"name": "A|nn"}]}');
    s.config['json.pathStyle'] = 'pointer';
    await cmd(JSON_PATH.copyPath);
    expect(s.clipboard).toBe('/users/0/name');
    s.config['json.pathStyle'] = 'js';
    await cmd(JSON_PATH.copyPath);
    expect(s.clipboard).toBe('users[0].name');
    s.config['json.pathStyle'] = 'nonsense';
    await cmd(JSON_PATH.copyPath);
    expect(s.clipboard).toBe('$.users[0].name');
  });

  it('works with CRLF line endings', async () => {
    open('{\r\n  "a": [\r\n    1,\r\n    |2\r\n  ]\r\n}');
    await cmd(JSON_PATH.copyPath);
    expect(s.clipboard).toBe('$.a[1]');
  });

  it('works in a plain-text document that holds JSON, not in one that does not', async () => {
    open('{"a": |1}', 'plaintext');
    await cmd(JSON_PATH.copyPath);
    expect(s.clipboard).toBe('$.a');

    open('hello |world', 'plaintext');
    await cmd(JSON_PATH.copyPath);
    expect(s.warnings).toEqual(['Multitool JSON Copy Path at Cursor: this document is not JSON.']);
  });

  it('half-written JSON in a JSON document still gives a path', async () => {
    open('{"a": [1, {"b": |', 'json');
    await cmd(JSON_PATH.copyPath);
    expect(s.clipboard).toBe('$.a[1].b');
  });

  it('warns without an editor', async () => {
    await cmd(JSON_PATH.copyPath);
    expect(s.warnings).toEqual(['Multitool JSON Copy Path at Cursor: open a JSON file first.']);
  });
});

describe('JSON Go to Path…', () => {
  const doc = '{\n  "users": [\n    {"name": "Ann"},\n    {"name": "Bo"}\n  ],\n  "a-b": 1\n}';

  it('pre-fills the current path and selects the value', async () => {
    const { text, offsetAt } = open(doc.replace('"Ann"', '"A|nn"'));
    s.input = '$.users[1].name';
    await cmd(JSON_PATH.goToPath);
    expect(s.inputOptions!.value).toBe('$.users[0].name');
    expect(selectedText(text, offsetAt)).toBe('"Bo"');
    expect(s.editor!.revealed).toHaveLength(1);
    expect(s.editor!.decorations[0]).toHaveLength(1);
    expect(s.runs).toMatchObject([{ toolId: 'json.goToPath', outcome: 'ok' }]);
  });

  it('accepts pointer and JS paths whatever the style setting', async () => {
    const { text, offsetAt } = open(doc.replace('{\n  "users"', '|{\n  "users"'));
    s.input = '/users/0';
    await cmd(JSON_PATH.goToPath);
    expect(s.inputOptions!.value).toBe('$');
    expect(selectedText(text, offsetAt)).toBe('{"name": "Ann"}');
    s.input = "['a-b']";
    await cmd(JSON_PATH.goToPath);
    expect(selectedText(text, offsetAt)).toBe('1');
  });

  it('explains a missing path and leaves the selection', async () => {
    open(doc.replace('"Ann"', '"A|nn"'));
    const before = s.editor!.selection;
    s.input = '$.users[5]';
    await cmd(JSON_PATH.goToPath);
    expect(s.warnings).toEqual(['Multitool JSON Go to Path…: no value at $.users[5] ($.users is an array with 2 items).']);
    expect(s.editor!.selection).toBe(before);
    expect(s.runs).toMatchObject([{ outcome: 'inputError' }]);
  });

  it('validates as you type', async () => {
    open(doc.replace('"Ann"', '"A|nn"'));
    await cmd(JSON_PATH.goToPath);
    const validate = s.inputOptions!.validateInput!;
    expect(validate('$.users[0]')).toBeUndefined();
    expect(validate('$..name')).toMatch(/Queries are not supported yet/);
    expect(validate('$.users[x]')).toMatch(/not an index/);
    // Escape closes the box and does nothing.
    expect(s.runs).toEqual([]);
  });
});

describe('JSON Count Array Items', () => {
  it('counts the closest array and copies the count', async () => {
    open('{"users": [{"tags": ["a", "|b", "c"]}, {}]}');
    s.infoPick = 'Copy';
    await cmd(JSON_PATH.countArrayItems);
    expect(s.infos).toEqual(['JSON Count Array Items: 3 items in $.users[0].tags']);
    expect(s.clipboard).toBe('3');
  });

  it('on the key of an array, and for a selected array', async () => {
    open('{"us|ers": [1], "other": «[1, 2]»}');
    await cmd(JSON_PATH.countArrayItems);
    expect(s.infos).toEqual(['JSON Count Array Items: 1 item in $.users, 2 items in $.other']);
  });

  it('multi-cursor counts each, root and empty arrays included', async () => {
    open('[[|], [1, 2], |3]');
    s.infoPick = 'Copy';
    await cmd(JSON_PATH.countArrayItems);
    expect(s.infos).toEqual(['JSON Count Array Items: 0 items in $[0], 3 items in $']);
    expect(s.clipboard).toBe('0\n3');
  });

  it('warns outside an array', async () => {
    open('{"a": |1}');
    await cmd(JSON_PATH.countArrayItems);
    expect(s.warnings).toEqual(['Multitool JSON Count Array Items: the cursor is not inside an array.']);
    expect(s.infos).toEqual([]);
  });
});
