/**
 * Tests the JSON Compare wiring (inputs, diff editor, report panel, copy, reveal)
 * against a small in-memory fake of the VS Code API.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  files: new Map<string, string>(),
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  executed: [] as unknown[][],
  provider: undefined as undefined | { provideTextDocumentContent(uri: unknown): string },
  tree: undefined as undefined | Record<string, unknown>,
  dataProvider: undefined as undefined | { getChildren(): unknown[]; getTreeItem(i: unknown): Record<string, unknown> },
  infos: [] as string[],
  warnings: [] as string[],
  errors: [] as string[],
  clipboard: '',
  quickPick: undefined as undefined | ((items: Record<string, unknown>[]) => Record<string, unknown> | undefined),
  quickPickItems: [] as Record<string, unknown>[],
  openDialog: undefined as undefined | unknown[],
  tabs: [] as { uri: unknown; label: string }[],
  active: undefined as undefined | string,
  visible: [] as { document: { uri: { toString(): string }; lineCount: number }; selection?: unknown; revealed?: unknown }[],
  config: {} as Record<string, unknown>,
  runs: [] as Record<string, unknown>[],
  bugs: [] as unknown[],
}));

vi.mock('../src/telemetry', () => ({
  trackToolRun: (e: Record<string, unknown>) => s.runs.push(e),
  trackBug: (err: unknown) => s.bugs.push(err),
}));

vi.mock('vscode', () => {
  class Uri {
    constructor(
      public scheme: string,
      public path: string,
    ) {}
    static file(p: string) {
      return new Uri('file', p);
    }
    static from(o: { scheme: string; path: string }) {
      return new Uri(o.scheme, o.path);
    }
    static joinPath(u: Uri, ...parts: string[]) {
      return new Uri(u.scheme, [u.path, ...parts].join('/'));
    }
    toString() {
      return `${this.scheme}:${this.path}`;
    }
  }
  class TabInputText {
    constructor(public uri: Uri) {}
  }
  class EventEmitter {
    event = () => ({ dispose() {} });
    fire() {}
    dispose() {}
  }
  class TreeItem {
    description?: string;
    constructor(public label: string) {}
  }
  class MarkdownString {
    value = '';
    appendMarkdown(t: string) {
      this.value += t;
      return this;
    }
    appendCodeblock(t: string) {
      this.value += t;
      return this;
    }
  }
  class Selection {
    constructor(
      public start: unknown,
      public end: unknown,
    ) {}
  }
  const doc = (uri: Uri) => {
    const text = uri.scheme === 'multitool-json' ? s.provider!.provideTextDocumentContent(uri) : s.files.get(uri.toString());
    if (text === undefined) throw new Error(`ENOENT ${uri}`);
    return { uri, getText: () => text, languageId: 'json', lineCount: text.split('\n').length };
  };
  return {
    Uri,
    TabInputText,
    EventEmitter,
    TreeItem,
    MarkdownString,
    Selection,
    ThemeIcon: class {
      constructor(public id: string) {}
    },
    ThemeColor: class {
      constructor(public id: string) {}
    },
    QuickPickItemKind: { Separator: -1 },
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
    window: {
      get tabGroups() {
        return { all: [{ tabs: s.tabs.map((t) => ({ label: t.label, input: new TabInputText(t.uri as Uri) })) }] };
      },
      get activeTextEditor() {
        return s.active ? { document: doc(Uri.file(s.active)) } : undefined;
      },
      get visibleTextEditors() {
        return s.visible;
      },
      createTreeView: (_id: string, o: { treeDataProvider: typeof s.dataProvider }) => {
        s.dataProvider = o.treeDataProvider;
        s.tree = { reveal: async () => undefined, dispose() {} };
        return s.tree;
      },
      showQuickPick: async (items: Record<string, unknown>[]) => {
        s.quickPickItems = items;
        return s.quickPick?.(items);
      },
      showOpenDialog: async () => s.openDialog,
      showInformationMessage: async (m: string) => void s.infos.push(m),
      showWarningMessage: async (m: string) => void s.warnings.push(m),
      showErrorMessage: async (m: string) => void s.errors.push(m),
    },
    workspace: {
      get textDocuments() {
        return [];
      },
      workspaceFolders: undefined,
      openTextDocument: async (uri: Uri) => doc(uri),
      asRelativePath: (uri: Uri) => uri.path.replace(/^\/ws\//, ''),
      getConfiguration: () => ({ get: (k: string, d: unknown) => (k in s.config ? s.config[k] : d) }),
      registerTextDocumentContentProvider: (_scheme: string, p: typeof s.provider) => {
        s.provider = p;
        return { dispose() {} };
      },
    },
    commands: {
      registerCommand: (id: string, fn: (...args: unknown[]) => unknown) => {
        s.commands.set(id, fn);
        return { dispose() {} };
      },
      executeCommand: async (...args: unknown[]) => void s.executed.push(args),
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
import { registerJsonCompare } from '../src/compare';
import { COMPARE } from '../src/compare/commands';

const file = (p: string) => vscode.Uri.file(p);
const cmd = (id: string, ...args: unknown[]) => s.commands.get(id)!(...args);
const diffCalls = () => s.executed.filter((a) => a[0] === 'vscode.diff');
const content = (uri: unknown) => s.provider!.provideTextDocumentContent(uri);

beforeEach(() => {
  Object.assign(s, {
    files: new Map(),
    commands: new Map(),
    executed: [],
    infos: [],
    warnings: [],
    errors: [],
    clipboard: '',
    quickPick: undefined,
    quickPickItems: [],
    openDialog: undefined,
    tabs: [],
    active: undefined,
    visible: [],
    config: {},
    runs: [],
    bugs: [],
  });
  s.files.set('file:/ws/a.json', '{"name":"Pradeep","roles":["dev"],"beta":true}');
  s.files.set('file:/ws/b.json', '{\n  "roles": ["dev", "admin"],\n  "name": "Pradeep B"\n}');
  registerJsonCompare({ subscriptions: [] } as unknown as vscode.ExtensionContext);
});

describe('JSON Compare', () => {
  it('compares two files selected in the Explorer: normalized diff editor + report', async () => {
    await cmd(COMPARE.compareSelected, file('/ws/a.json'), [file('/ws/a.json'), file('/ws/b.json')]);

    const [[, leftUri, rightUri, title]] = diffCalls();
    expect(title).toBe('a.json ↔ b.json (JSON)');
    expect(content(leftUri)).toBe('{\n  "beta": true,\n  "name": "Pradeep",\n  "roles": [\n    "dev"\n  ]\n}\n');
    expect(content(rightUri)).toBe('{\n  "name": "Pradeep B",\n  "roles": [\n    "dev",\n    "admin"\n  ]\n}\n');

    expect(s.tree!.message).toBe('a.json ↔ b.json · 1 changed · 1 added · 1 removed');
    expect(s.tree!.badge).toMatchObject({ value: 3 });
    expect(s.executed).toContainEqual(['setContext', 'multitool.jsonDiff.hasResult', true]);
    const items = s.dataProvider!.getChildren().map((i) => s.dataProvider!.getTreeItem(i));
    expect(items.map((i) => [i.label, i.description])).toEqual([
      ['$.beta', '− true'],
      ['$.name', '"Pradeep" → "Pradeep B"'],
      ['$.roles[1]', '+ "admin"'],
    ]);
    expect(s.runs).toEqual([expect.objectContaining({ toolId: 'json.compare', source: 'explorer', outcome: 'ok' })]);
  });

  it('compares the active tab with a picked tab, picked one on the left; JSON tabs listed first', async () => {
    s.active = '/ws/b.json';
    s.files.set('file:/ws/notes.txt', 'hello');
    s.tabs = [
      { uri: file('/ws/notes.txt'), label: 'notes.txt' },
      { uri: file('/ws/a.json'), label: 'a.json' },
      { uri: file('/ws/b.json'), label: 'b.json' },
    ];
    s.quickPick = (items) => items.find((i) => String(i.label).includes('a.json'));
    await cmd(COMPARE.compareWith);

    expect(s.quickPickItems.map((i) => i.label)).toEqual([
      'Open JSON tabs',
      '$(json) a.json',
      'Other open tabs',
      '$(file) notes.txt',
      '',
      '$(folder-opened) Browse…',
    ]);
    expect(diffCalls()[0][3]).toBe('a.json ↔ b.json (JSON)');
    expect(s.runs[0]).toMatchObject({ source: 'command', outcome: 'ok' });
  });

  it('compares with a file chosen via Browse…, from the editor tab menu', async () => {
    s.quickPick = (items) => items.find((i) => i.browse);
    s.openDialog = [file('/ws/a.json')];
    await cmd(COMPARE.compareWith, file('/ws/b.json'));
    expect(diffCalls()).toHaveLength(1);
    expect(s.runs[0]).toMatchObject({ source: 'contextMenu' });
  });

  it('shows a message instead of a diff when only key order and formatting differ', async () => {
    s.files.set('file:/ws/c.json', '{ "beta": true, "roles": ["dev"], "name": "Pradeep" }');
    await cmd(COMPARE.compareSelected, undefined, [file('/ws/a.json'), file('/ws/c.json')]);
    expect(diffCalls()).toHaveLength(0);
    expect(s.infos[0]).toMatch(/no differences between a\.json and c\.json/);
  });

  it('with sortKeys off, key-order-only differences open the diff with an explanatory report', async () => {
    s.config['jsonCompare.sortKeys'] = false;
    s.files.set('file:/ws/c.json', '{ "beta": true, "roles": ["dev"], "name": "Pradeep" }');
    await cmd(COMPARE.compareSelected, undefined, [file('/ws/a.json'), file('/ws/c.json')]);
    expect(diffCalls()).toHaveLength(1);
    const items = s.dataProvider!.getChildren().map((i) => s.dataProvider!.getTreeItem(i));
    expect(items[0].label).toMatch(/only key order or formatting differs/);
  });

  it('reports invalid JSON with the side, file and position, and opens nothing', async () => {
    s.files.set('file:/ws/bad.json', '{\n  "a": 1,\n  "b": \n}');
    await cmd(COMPARE.compareSelected, undefined, [file('/ws/a.json'), file('/ws/bad.json')]);
    expect(diffCalls()).toHaveLength(0);
    expect(s.errors[0]).toBe('Multitool JSON Compare: Right (bad.json): Invalid JSON (line 4, column 1): Value expected.');
    expect(s.runs[0]).toMatchObject({ outcome: 'inputError' });
  });

  it('accepts JSON with comments and says comments are ignored', async () => {
    s.files.set('file:/ws/tsconfig.json', '{ // comment\n "name": "Pradeep", "roles": ["dev"], "beta": false, }');
    await cmd(COMPARE.compareSelected, undefined, [file('/ws/a.json'), file('/ws/tsconfig.json')]);
    expect(s.tree!.message).toBe('a.json ↔ tsconfig.json · 1 changed · comments ignored');
  });

  it('labels same-named files by relative path', async () => {
    s.files.set('file:/ws/x/config.json', '{"a":1}');
    s.files.set('file:/ws/y/config.json', '{"a":2}');
    await cmd(COMPARE.compareSelected, undefined, [file('/ws/x/config.json'), file('/ws/y/config.json')]);
    expect(diffCalls()[0][3]).toBe('x/config.json ↔ y/config.json (JSON)');
  });

  it('needs exactly two files from the Explorer and an editor for Compare with…', async () => {
    await cmd(COMPARE.compareSelected, file('/ws/a.json'), [file('/ws/a.json')]);
    await cmd(COMPARE.compareWith);
    expect(s.warnings).toEqual([
      'Multitool JSON Compare: select exactly two files in the Explorer.',
      'Multitool JSON Compare: open a JSON file or tab first, or select two JSON files in the Explorer.',
    ]);
  });

  it('reports unreadable files without crashing', async () => {
    await cmd(COMPARE.compareSelected, undefined, [file('/ws/a.json'), file('/ws/missing.json')]);
    expect(s.errors[0]).toMatch(/^Multitool JSON Compare: could not read the files\./);
  });

  it('copies the report as Markdown and clears it', async () => {
    await cmd(COMPARE.compareSelected, undefined, [file('/ws/a.json'), file('/ws/b.json')]);
    await cmd(COMPARE.copyMarkdown);
    expect(s.clipboard).toContain('| ~ changed | `$.name` | `"Pradeep"` | `"Pradeep B"` |');
    await cmd(COMPARE.clear);
    expect(s.dataProvider!.getChildren()).toEqual([]);
    expect(s.executed).toContainEqual(['setContext', 'multitool.jsonDiff.hasResult', false]);
  });

  it('clicking a change selects its line on both sides of the diff', async () => {
    await cmd(COMPARE.compareSelected, undefined, [file('/ws/a.json'), file('/ws/b.json')]);
    const [[, leftUri, rightUri]] = diffCalls();
    const editor = (uri: unknown) => {
      const lines = content(uri).split('\n');
      return {
        document: { uri: uri as { toString(): string }, lineCount: lines.length, lineAt: (n: number) => ({ range: { start: n, end: n, text: lines[n] } }) },
        selection: undefined as unknown,
        revealRange: vi.fn(),
      };
    };
    const left = editor(leftUri);
    const right = editor(rightUri);
    s.visible = [left, right] as never;

    const added = s.dataProvider!.getChildren()[2] as { change: unknown };
    await cmd(COMPARE.reveal, added.change);
    // "+ $.roles[1]": its own line on the right; on the left, the nearest existing parent ("roles").
    expect(right.selection).toMatchObject({ start: 4, end: 4 });
    expect(left.selection).toMatchObject({ start: 3, end: 3 });
    expect(diffCalls()).toHaveLength(1); // diff already visible: not reopened
  });
});
