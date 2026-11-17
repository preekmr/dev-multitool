import * as vscode from 'vscode';
import { ToolError } from '../core/tool';
import { errorType, type RunOutcome, type RunSource } from '../core/telemetry-format';
import { trackBug, trackToolRun } from '../telemetry';
import { COMPARE } from './commands';
import { NormalizedContentProvider, SCHEME } from './content';
import { diffJson, formatJson, parseDocument, type JsonChange } from './diff';
import { lineForPath } from './lineForPath';
import { DiffReportView, type CompareResult } from './view';

/** One side of a comparison. */
interface Side {
  uri: vscode.Uri;
  name: string;
  text: string;
}

export const COMPARE_TOOL_ID = 'json.compare';

const JSON_EXTENSIONS = ['json', 'jsonc', 'json5', 'geojson', 'har', 'webmanifest'];
const JSON_FILE = new RegExp(`\\.(${JSON_EXTENSIONS.join('|')})$`, 'i');

function baseName(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] || uri.path;
}

function isJsonLike(uri: vscode.Uri): boolean {
  if (JSON_FILE.test(uri.path)) return true;
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  return doc?.languageId === 'json' || doc?.languageId === 'jsonc';
}

async function readSide(uri: vscode.Uri): Promise<Side> {
  // Uses the open document when there is one, so unsaved changes are compared too.
  const doc = await vscode.workspace.openTextDocument(uri);
  return { uri, name: baseName(uri), text: doc.getText() };
}

function indentSetting(): string {
  const setting = vscode.workspace.getConfiguration('multitool').get<string | number>('indent', 'auto');
  if (setting === 'tab') return '\t';
  return ' '.repeat(typeof setting === 'number' ? setting : 2);
}

interface OtherItem extends vscode.QuickPickItem {
  uri?: vscode.Uri;
  browse?: boolean;
}

/** Lets the user pick the other side: an open tab (JSON first) or a file on disk. */
async function pickOther(current: vscode.Uri): Promise<vscode.Uri | undefined> {
  const seen = new Set<string>([current.toString()]);
  const tabs: { uri: vscode.Uri; label: string }[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (!(tab.input instanceof vscode.TabInputText)) continue;
      const uri = tab.input.uri;
      if (uri.scheme === SCHEME || seen.has(uri.toString())) continue;
      seen.add(uri.toString());
      tabs.push({ uri, label: tab.label });
    }
  }
  const json = tabs.filter((t) => isJsonLike(t.uri));
  const other = tabs.filter((t) => !isJsonLike(t.uri));
  const toItem = (t: { uri: vscode.Uri; label: string }, icon: string): OtherItem => ({
    label: `$(${icon}) ${t.label}`,
    description: t.uri.scheme === 'untitled' ? 'unsaved' : vscode.workspace.asRelativePath(t.uri, true),
    uri: t.uri,
  });

  const items: OtherItem[] = [];
  if (json.length) {
    items.push({ label: 'Open JSON tabs', kind: vscode.QuickPickItemKind.Separator });
    items.push(...json.map((t) => toItem(t, 'json')));
  }
  if (other.length) {
    items.push({ label: 'Other open tabs', kind: vscode.QuickPickItemKind.Separator });
    items.push(...other.map((t) => toItem(t, 'file')));
  }
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: '$(folder-opened) Browse…', description: 'Pick a file from disk', browse: true });

  const picked = await vscode.window.showQuickPick(items, {
    title: `JSON Compare: ${baseName(current)} with…`,
    placeHolder: 'Pick a tab or file to compare with (it opens on the left)',
    matchOnDescription: true,
  });
  if (!picked) return undefined;
  if (!picked.browse) return picked.uri;

  const files = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Compare',
    defaultUri: current.scheme === 'file' ? vscode.Uri.joinPath(current, '..') : vscode.workspace.workspaceFolders?.[0]?.uri,
    filters: { JSON: JSON_EXTENSIONS, 'All files': ['*'] },
  });
  return files?.[0];
}

/** Gives two sides with the same file name distinguishable labels. */
function distinctNames(left: Side, right: Side): void {
  if (left.name !== right.name) return;
  left.name = vscode.workspace.asRelativePath(left.uri, true);
  right.name = vscode.workspace.asRelativePath(right.uri, true);
  if (left.name === right.name) {
    left.name += ' (left)';
    right.name += ' (right)';
  }
}

export function registerJsonCompare(context: vscode.ExtensionContext): void {
  const provider = new NormalizedContentProvider();
  const view = new DiffReportView();

  const report = (source: RunSource, outcome: RunOutcome, durationMs: number, err?: unknown) => {
    try {
      trackToolRun({
        toolId: COMPARE_TOOL_ID,
        source,
        ranges: 2,
        wholeDocument: true,
        outputMode: 'diff',
        outcome,
        durationMs,
        errorType: err === undefined ? undefined : errorType(err),
      });
      if (outcome === 'bug') trackBug(err, COMPARE_TOOL_ID);
    } catch {
      // Telemetry must never affect the user.
    }
  };

  const openDiff = (r: CompareResult) =>
    vscode.commands.executeCommand('vscode.diff', r.leftUri, r.rightUri, `${r.leftName} ↔ ${r.rightName} (JSON)`, {
      preview: false,
    });

  async function compare(left: Side, right: Side, source: RunSource): Promise<void> {
    const started = Date.now();
    let result: CompareResult;
    try {
      distinctNames(left, right);
      const l = parseDocument(left.text, `Left (${left.name})`);
      const r = parseDocument(right.text, `Right (${right.name})`);
      const sortKeys = vscode.workspace.getConfiguration('multitool').get<boolean>('jsonCompare.sortKeys', true);
      const indent = indentSetting();
      const changes = diffJson(l.value, r.value, { sortKeys });
      const lf = formatJson(l.value, indent, sortKeys);
      const rf = formatJson(r.value, indent, sortKeys);
      result = {
        leftName: left.name,
        rightName: right.name,
        leftUri: provider.add(left.name, lf.text),
        rightUri: provider.add(right.name, rf.text),
        changes,
        leftLines: lf.lineOf,
        rightLines: rf.lineOf,
        jsonc: l.jsonc || r.jsonc,
      };
      if (changes.length === 0 && lf.text === rf.text) {
        report(source, 'ok', Date.now() - started);
        void vscode.window.showInformationMessage(
          `JSON Compare: no differences between ${left.name} and ${right.name} (key order and formatting ignored).`,
        );
        return;
      }
    } catch (err) {
      report(source, err instanceof ToolError ? 'inputError' : 'bug', Date.now() - started, err);
      void vscode.window.showErrorMessage(`Multitool JSON Compare: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    report(source, 'ok', Date.now() - started);
    await openDiff(result);
    await view.show(result);
  }

  async function reveal(change: JsonChange): Promise<void> {
    const r = view.result;
    if (!r) return;
    const editors = () => vscode.window.visibleTextEditors;
    const find = (uri: vscode.Uri) => editors().find((e) => e.document.uri.toString() === uri.toString());
    if (!find(r.leftUri) && !find(r.rightUri)) await openDiff(r);

    const targets: [vscode.Uri, Map<string, number>][] = [];
    if (change.kind !== 'added') targets.push([r.leftUri, r.leftLines]);
    if (change.kind !== 'removed') targets.push([r.rightUri, r.rightLines]);
    // Also move the other side to the nearest matching line, so both stay aligned.
    if (change.kind === 'added') targets.push([r.leftUri, r.leftLines]);
    if (change.kind === 'removed') targets.push([r.rightUri, r.rightLines]);

    for (const [uri, lines] of targets) {
      const editor = find(uri);
      if (!editor) continue;
      const line = Math.min(lineForPath(lines, change.path), editor.document.lineCount - 1);
      const range = editor.document.lineAt(line).range;
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }

  context.subscriptions.push(
    view,
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),

    // Command Palette, editor right-click menu and editor tab right-click menu (with the tab's uri).
    vscode.commands.registerCommand(COMPARE.compareWith, async (uri?: vscode.Uri) => {
      const source: RunSource = uri instanceof vscode.Uri ? 'contextMenu' : 'command';
      const current = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
      if (!current || current.scheme === SCHEME) {
        void vscode.window.showWarningMessage(
          'Multitool JSON Compare: open a JSON file or tab first, or select two JSON files in the Explorer.',
        );
        return;
      }
      const other = await pickOther(current);
      if (!other) return;
      try {
        // VS Code convention ("Compare Active File With…"): the picked file goes on the left.
        const [left, right] = await Promise.all([readSide(other), readSide(current)]);
        await compare(left, right, source);
      } catch (err) {
        void vscode.window.showErrorMessage(`Multitool JSON Compare: could not read the file. ${err instanceof Error ? err.message : ''}`);
      }
    }),

    // Explorer: two files selected → right-click.
    vscode.commands.registerCommand(COMPARE.compareSelected, async (clicked?: vscode.Uri, selected?: vscode.Uri[]) => {
      const uris = selected?.length ? selected : clicked ? [clicked] : [];
      if (uris.length !== 2) {
        void vscode.window.showWarningMessage('Multitool JSON Compare: select exactly two files in the Explorer.');
        return;
      }
      try {
        const [left, right] = await Promise.all(uris.map(readSide));
        await compare(left, right, 'explorer');
      } catch (err) {
        void vscode.window.showErrorMessage(`Multitool JSON Compare: could not read the files. ${err instanceof Error ? err.message : ''}`);
      }
    }),

    vscode.commands.registerCommand(COMPARE.reveal, (change: JsonChange) => reveal(change)),

    vscode.commands.registerCommand(COMPARE.copyMarkdown, async () => {
      const md = view.markdown();
      if (!md) return;
      await vscode.env.clipboard.writeText(md);
      void vscode.window.showInformationMessage('JSON diff copied as Markdown.');
    }),

    vscode.commands.registerCommand(COMPARE.clear, () => view.clear()),
  );
}
