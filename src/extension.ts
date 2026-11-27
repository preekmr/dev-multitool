import * as vscode from 'vscode';
import { tools } from './tools';
import { commandId, type Tool } from './core/tool';
import { runTool } from './core/runner';
import { pickTool } from './core/picker';
import { initTelemetry } from './telemetry';
import { registerJsonCompare } from './compare';
import { COMPARE } from './compare/commands';
import { features } from './features';
import { registerJsonPath } from './features/json';

const LAST_TOOL_KEY = 'multitool.lastToolId';

export function activate(context: vscode.ExtensionContext): void {
  initTelemetry(context);
  registerJsonCompare(context);
  registerJsonPath(context);
  const byId = new Map(tools.map((t) => [t.id, t]));

  const remember = (tool: Tool) => context.workspaceState.update(LAST_TOOL_KEY, tool.id);

  // One command per tool: shows up in the Command Palette and can be bound to a key.
  for (const tool of tools) {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId(tool), async () => {
        await remember(tool);
        await runTool(tool);
      }),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('multitool.runTool', async () => {
      const picked = await pickTool(tools, 'Multitool: pick a tool to run on the selection or document', [
        {
          category: 'JSON',
          title: 'Compare with…',
          description: 'Compare with another tab or file, ignoring key order and formatting',
          command: COMPARE.compareWith,
        },
        ...features.flatMap((f) =>
          f.commands
            .filter((c) => c.picker)
            .map((c) => ({ category: f.category, title: c.title, description: c.description, command: c.command })),
        ),
      ]);
      if (!picked) return;
      if ('command' in picked) {
        await vscode.commands.executeCommand(picked.command);
        return;
      }
      await remember(picked.tool);
      await runTool(picked.tool, { source: 'picker' });
    }),
    vscode.commands.registerCommand('multitool.runToolToNewTab', async () => {
      const picked = await pickTool(tools, 'Multitool: pick a tool — the result opens in a new tab');
      if (!picked || !('tool' in picked)) return;
      await remember(picked.tool);
      await runTool(picked.tool, { output: 'newDocument', source: 'pickerNewTab' });
    }),
    vscode.commands.registerCommand('multitool.repeatLastTool', async () => {
      const id = context.workspaceState.get<string>(LAST_TOOL_KEY);
      const tool = id ? byId.get(id) : undefined;
      if (!tool) {
        await vscode.commands.executeCommand('multitool.runTool');
        return;
      }
      await runTool(tool, { source: 'repeatLast' });
    }),
  );
}

export function deactivate(): void {}
