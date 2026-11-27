/**
 * JSON Path and array counts in the editor: Copy Path at Cursor, Go to Path… and Count Array Items.
 * The logic lives in src/core/json (pure, tested); this file is the VS Code glue.
 */
import * as vscode from 'vscode';
import {
  arrayInfoAt,
  DEFAULT_PATH_STYLE,
  describePath,
  formatPath,
  isJson,
  parsePath,
  pathAtOffset,
  PATH_STYLES,
  resolvePath,
  type PathSegment,
  type PathStyle,
} from '../../core/json';
import { ToolError } from '../../core/tool';
import { errorType, type RunOutcome } from '../../core/telemetry-format';
import { trackBug, trackToolRun } from '../../telemetry';
import { JSON_PATH, PATH_STYLE_SETTING } from './commands';

const JSON_LANGUAGES = new Set(['json', 'jsonc']);
const HIGHLIGHT_MS = 1500;

function pathStyle(): PathStyle {
  const value = vscode.workspace.getConfiguration('multitool').get<string>(PATH_STYLE_SETTING, DEFAULT_PATH_STYLE);
  return (PATH_STYLES as readonly string[]).includes(value) ? (value as PathStyle) : DEFAULT_PATH_STYLE;
}

/** The active editor and its text, when it holds JSON. Warns and returns undefined otherwise. */
function jsonEditor(title: string): { editor: vscode.TextEditor; text: string } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage(`Multitool ${title}: open a JSON file first.`);
    return undefined;
  }
  const text = editor.document.getText();
  // JSON and JSONC documents may be half-written: partial answers still help. Others must parse.
  if (!JSON_LANGUAGES.has(editor.document.languageId) && !isJson(text)) {
    void vscode.window.showWarningMessage(`Multitool ${title}: this document is not JSON.`);
    return undefined;
  }
  return { editor, text };
}

/** Selections in document order. */
function sortedSelections(editor: vscode.TextEditor): readonly vscode.Selection[] {
  return [...editor.selections].sort((a, b) => a.start.compareTo(b.start));
}

/** Runs a command body with usage telemetry, like the tools do. Never lets telemetry break a run. */
async function tracked(id: string, outputMode: string, ranges: number, body: () => Promise<RunOutcome> | RunOutcome) {
  const started = Date.now();
  let outcome: RunOutcome = 'ok';
  let failure: unknown;
  try {
    outcome = await body();
  } catch (err) {
    failure = err;
    outcome = err instanceof ToolError ? 'inputError' : 'bug';
  }
  try {
    trackToolRun({
      toolId: id.replace(/^multitool\./, ''),
      source: 'command',
      ranges,
      wholeDocument: false,
      outputMode,
      outcome,
      durationMs: Date.now() - started,
      errorType: failure === undefined ? undefined : errorType(failure),
    });
    if (outcome === 'bug') trackBug(failure, id.replace(/^multitool\./, ''));
  } catch {
    // Telemetry must never affect the user.
  }
  if (failure !== undefined) throw failure;
}

async function copyPath(): Promise<void> {
  const title = 'JSON Copy Path at Cursor';
  const target = jsonEditor(title);
  if (!target) return;
  const { editor, text } = target;
  const selections = sortedSelections(editor);
  await tracked(JSON_PATH.copyPath, 'clipboard', selections.length, async () => {
    const style = pathStyle();
    const paths: PathSegment[][] = [];
    for (const s of selections) {
      const p = pathAtOffset(text, editor.document.offsetAt(s.active));
      if (p === null) {
        void vscode.window.showWarningMessage(`Multitool ${title}: the document has no JSON value yet.`);
        return 'inputError';
      }
      paths.push(p);
    }
    await vscode.env.clipboard.writeText(paths.map((p) => formatPath(p, style)).join('\n'));
    const shown = paths.length === 1 ? describePath(paths[0], style) : `${paths.length} paths`;
    vscode.window.setStatusBarMessage(`$(copy) Copied ${shown}`, 3000);
    return 'ok';
  });
}

/** Briefly highlights a range, so the eye finds the selected value. */
class Flash implements vscode.Disposable {
  private readonly type = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    borderColor: new vscode.ThemeColor('editor.findMatchHighlightBorder'),
    borderStyle: 'solid',
    borderWidth: '1px',
  });
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(editor: vscode.TextEditor, range: vscode.Range): void {
    if (this.timer) clearTimeout(this.timer);
    editor.setDecorations(this.type, [range]);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      editor.setDecorations(this.type, []);
    }, HIGHLIGHT_MS);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.type.dispose();
  }
}

async function goToPath(flash: Flash): Promise<void> {
  const title = 'JSON Go to Path…';
  const target = jsonEditor(title);
  if (!target) return;
  const { editor, text } = target;
  const style = pathStyle();
  const current = pathAtOffset(text, editor.document.offsetAt(editor.selection.active)) ?? [];
  const input = await vscode.window.showInputBox({
    title: 'JSON Go to Path',
    value: formatPath(current, style),
    prompt: 'A path like $.users[3].name, users[3].name or /users/3/name. $ is the whole document.',
    placeHolder: '$.users[3].name',
    validateInput: (value) => {
      try {
        parsePath(value);
        return undefined;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  });
  if (input === undefined) return;

  await tracked(JSON_PATH.goToPath, 'select', 1, () => {
    // The document may have changed while the input box was open.
    const now = editor.document.getText();
    const segments = parsePath(input);
    const result = resolvePath(now, segments);
    if (!result.found) {
      void vscode.window.showWarningMessage(`Multitool ${title}: no value at ${describePath(segments)} (${result.reason}).`);
      return 'inputError';
    }
    const start = editor.document.positionAt(result.offset);
    const end = editor.document.positionAt(result.offset + result.length);
    const range = new vscode.Range(start, end);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    flash.show(editor, range);
    return 'ok';
  });
}

async function countArrayItems(): Promise<void> {
  const title = 'JSON Count Array Items';
  const target = jsonEditor(title);
  if (!target) return;
  const { editor, text } = target;
  const selections = sortedSelections(editor);
  let shown: string | undefined;
  let copy = '';
  await tracked(JSON_PATH.countArrayItems, 'message', selections.length, () => {
    const style = pathStyle();
    const lines: string[] = [];
    const counts: number[] = [];
    for (const s of selections) {
      const info = arrayInfoAt(text, editor.document.offsetAt(s.isEmpty ? s.active : s.start));
      if (!info) continue;
      counts.push(info.count);
      lines.push(`${info.count} ${info.count === 1 ? 'item' : 'items'} in ${describePath(info.path, style)}`);
    }
    if (counts.length === 0) {
      const where = selections.length > 1 ? 'no cursor is' : 'the cursor is not';
      void vscode.window.showWarningMessage(`Multitool ${title}: ${where} inside an array.`);
      return 'inputError';
    }
    shown = lines.join(', ');
    copy = counts.join('\n');
    return 'ok';
  });
  if (shown === undefined) return;
  const pick = await vscode.window.showInformationMessage(`${title}: ${shown}`, 'Copy');
  if (pick === 'Copy') await vscode.env.clipboard.writeText(copy);
}

/** Wraps a command so an unexpected error shows a message instead of failing silently. */
function command(title: string, run: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await run();
    } catch (err) {
      void vscode.window.showErrorMessage(`Multitool ${title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

export function registerJsonPath(context: vscode.ExtensionContext): void {
  const flash = new Flash();
  context.subscriptions.push(
    flash,
    vscode.commands.registerCommand(JSON_PATH.copyPath, command('JSON Copy Path at Cursor', copyPath)),
    vscode.commands.registerCommand(JSON_PATH.goToPath, command('JSON Go to Path…', () => goToPath(flash))),
    vscode.commands.registerCommand(JSON_PATH.countArrayItems, command('JSON Count Array Items', countArrayItems)),
  );
}
