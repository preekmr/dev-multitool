import * as vscode from 'vscode';
import { displayTitle, type Tool } from './tool';

interface ToolItem extends vscode.QuickPickItem {
  tool?: Tool;
}

/** Shows every tool, grouped by category. Resolves to the chosen tool, if any. */
export async function pickTool(tools: readonly Tool[], placeHolder: string): Promise<Tool | undefined> {
  const items: ToolItem[] = [];
  let currentCategory: string | undefined;
  const sorted = [...tools].sort((a, b) => a.category.localeCompare(b.category));
  for (const tool of sorted) {
    if (tool.category !== currentCategory) {
      currentCategory = tool.category;
      items.push({ label: tool.category, kind: vscode.QuickPickItemKind.Separator });
    }
    items.push({ label: displayTitle(tool), description: tool.description, tool });
  }
  const picked = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true });
  return picked?.tool;
}
