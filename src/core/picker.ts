import * as vscode from 'vscode';
import { displayTitle, type Tool } from './tool';

/** A picker entry that runs a command instead of a text tool (e.g. JSON Compare). */
export interface PickerCommand {
  category: string;
  title: string;
  description?: string;
  command: string;
}

export type Picked = { tool: Tool } | { command: string };

interface PickItem extends vscode.QuickPickItem {
  picked_?: Picked;
}

/** Shows every tool (and extra commands), grouped by category. Resolves to the chosen entry, if any. */
export async function pickTool(
  tools: readonly Tool[],
  placeHolder: string,
  extras: readonly PickerCommand[] = [],
): Promise<Picked | undefined> {
  const entries = [
    ...tools.map((tool) => ({ category: tool.category, label: displayTitle(tool), description: tool.description, picked: { tool } as Picked })),
    ...extras.map((e) => ({ category: e.category, label: `${e.category} ${e.title}`, description: e.description, picked: { command: e.command } as Picked })),
  ];
  // Stable sort keeps each category's tools in registry order, extras last.
  entries.sort((a, b) => a.category.localeCompare(b.category));
  const items: PickItem[] = [];
  let currentCategory: string | undefined;
  for (const e of entries) {
    if (e.category !== currentCategory) {
      currentCategory = e.category;
      items.push({ label: e.category, kind: vscode.QuickPickItemKind.Separator });
    }
    items.push({ label: e.label, description: e.description, picked_: e.picked });
  }
  const choice = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true });
  return choice?.picked_;
}
