import * as vscode from 'vscode';
import { COMPARE, COMPARE_VIEW, HAS_RESULT_CONTEXT } from './commands';
import {
  describeChange,
  formatPath,
  previewValue,
  renderMarkdown,
  summarize,
  summaryText,
  type JsonChange,
} from './diff';

export const VIEW_MAX_ITEMS = 2000;

export interface CompareResult {
  leftName: string;
  rightName: string;
  leftUri: vscode.Uri;
  rightUri: vscode.Uri;
  changes: JsonChange[];
  leftLines: Map<string, number>;
  rightLines: Map<string, number>;
  /** True when a side was parsed as JSON with comments (comments are not compared). */
  jsonc: boolean;
}

type Item = { type: 'change'; change: JsonChange } | { type: 'more'; count: number } | { type: 'none' };

const ICONS = {
  added: new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground')),
  removed: new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground')),
  changed: new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')),
};

/** The "JSON Diff" report in the bottom panel. */
export class DiffReportView implements vscode.TreeDataProvider<Item> {
  private readonly emitter = new vscode.EventEmitter<Item | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  readonly treeView: vscode.TreeView<Item>;
  result: CompareResult | undefined;

  constructor() {
    this.treeView = vscode.window.createTreeView(COMPARE_VIEW, { treeDataProvider: this });
  }

  dispose(): void {
    this.treeView.dispose();
    this.emitter.dispose();
  }

  async show(result: CompareResult): Promise<void> {
    this.result = result;
    const summary = summaryText(summarize(result.changes));
    this.treeView.message = `${result.leftName} ↔ ${result.rightName} · ${summary}${
      result.jsonc ? ' · comments ignored' : ''
    }`;
    this.treeView.badge = result.changes.length
      ? { value: result.changes.length, tooltip: `${result.changes.length} JSON differences` }
      : undefined;
    await vscode.commands.executeCommand('setContext', HAS_RESULT_CONTEXT, true);
    this.emitter.fire(undefined);
    // Bring the panel into view without taking focus away from the diff editor.
    const first = this.getChildren()[0];
    if (first) await this.treeView.reveal(first, { focus: false, select: false });
  }

  async clear(): Promise<void> {
    this.result = undefined;
    this.treeView.message = undefined;
    this.treeView.badge = undefined;
    await vscode.commands.executeCommand('setContext', HAS_RESULT_CONTEXT, false);
    this.emitter.fire(undefined);
  }

  markdown(): string | undefined {
    if (!this.result) return undefined;
    return renderMarkdown(this.result.changes, this.result.leftName, this.result.rightName);
  }

  getChildren(element?: Item): Item[] {
    if (element || !this.result) return [];
    const { changes } = this.result;
    if (changes.length === 0) return [{ type: 'none' }];
    const items: Item[] = changes.slice(0, VIEW_MAX_ITEMS).map((change) => ({ type: 'change', change }));
    if (changes.length > VIEW_MAX_ITEMS) items.push({ type: 'more', count: changes.length - VIEW_MAX_ITEMS });
    return items;
  }

  getParent(): undefined {
    return undefined;
  }

  getTreeItem(item: Item): vscode.TreeItem {
    if (item.type === 'none') {
      return new vscode.TreeItem('No value differences (only key order or formatting differs)');
    }
    if (item.type === 'more') {
      const t = new vscode.TreeItem(`…and ${item.count} more. Copy as Markdown for the full list.`);
      t.iconPath = new vscode.ThemeIcon('ellipsis');
      return t;
    }
    const c = item.change;
    const t = new vscode.TreeItem(formatPath(c.path));
    t.description = describeChange(c);
    t.iconPath = ICONS[c.kind];
    const tip = new vscode.MarkdownString();
    tip.appendMarkdown(`**${c.kind}** \`${formatPath(c.path)}\`\n\n`);
    if (c.kind !== 'added') tip.appendCodeblock(previewValue(c.oldValue, 400), 'json');
    if (c.kind === 'changed') tip.appendMarkdown('→\n');
    if (c.kind !== 'removed') tip.appendCodeblock(previewValue(c.newValue, 400), 'json');
    t.tooltip = tip;
    t.command = { command: COMPARE.reveal, title: 'Show in diff', arguments: [c] };
    return t;
  }
}
