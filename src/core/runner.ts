import * as vscode from 'vscode';
import { displayTitle, type Tool, type ToolContext, ToolError } from './tool';
import { errorType, type RunOutcome, type RunSource } from './telemetry-format';
import { trackBug, trackToolRun } from '../telemetry';

type Output = NonNullable<Tool['output']>;

function buildContext(editor: vscode.TextEditor): ToolContext {
  const config = vscode.workspace.getConfiguration('multitool');
  const setting = config.get<string | number>('indent', 'auto');
  let indent: ToolContext['indent'];
  if (setting === 'tab') {
    indent = '\t';
  } else if (typeof setting === 'number') {
    indent = setting;
  } else {
    const { insertSpaces, tabSize } = editor.options;
    indent = insertSpaces === false ? '\t' : typeof tabSize === 'number' ? tabSize : 2;
  }
  const eol = editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  return { indent, eol };
}

/** The ranges a tool operates on: non-empty selections, else the whole document. */
function targetRanges(editor: vscode.TextEditor, tool: Tool): vscode.Range[] {
  const { document, selections } = editor;
  if (tool.input === 'none') {
    return selections.map((s) => new vscode.Range(s.start, s.end));
  }
  const nonEmpty = selections.filter((s) => !s.isEmpty);
  if (nonEmpty.length > 0) {
    return nonEmpty.map((s) => new vscode.Range(s.start, s.end));
  }
  const last = document.lineAt(document.lineCount - 1);
  return [new vscode.Range(0, 0, last.lineNumber, last.range.end.character)];
}

function errorMessage(err: unknown): string {
  if (err instanceof ToolError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface RunOptions {
  /** Override the tool's default output mode. */
  output?: Output;
  /** How the run was started, for usage telemetry. Default: 'command'. */
  source?: RunSource;
}

export async function runTool(tool: Tool, options: RunOptions = {}): Promise<void> {
  const title = displayTitle(tool);
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage(`Multitool: open a file or select some text to run "${title}".`);
    return;
  }

  const ctx = buildContext(editor);
  const ranges = targetRanges(editor, tool);
  const output = options.output ?? tool.output ?? 'replace';
  const started = Date.now();
  let durationMs = 0;

  // Telemetry must never block or break a run, so any failure in it is ignored.
  const report = (outcome: RunOutcome, err?: unknown) => {
    try {
      trackToolRun({
        toolId: tool.id,
        source: options.source ?? 'command',
        ranges: ranges.length,
        wholeDocument: tool.input !== 'none' && editor.selections.every((s) => s.isEmpty),
        outputMode: output,
        outcome,
        durationMs,
        errorType: err === undefined ? undefined : errorType(err),
      });
      if (outcome === 'bug') trackBug(err, tool.id);
    } catch {
      // ignore
    }
  };

  let results: string[];
  try {
    results = [];
    for (const range of ranges) {
      results.push(await tool.run(editor.document.getText(range), ctx));
    }
    durationMs = Date.now() - started;
  } catch (err) {
    durationMs = Date.now() - started;
    if (err instanceof ToolError) {
      report('inputError', err);
    } else {
      // Not a validation failure: a bug in the tool. Report it with a (scrubbed) stack trace.
      report('bug', err);
    }
    void vscode.window.showErrorMessage(`Multitool ${title}: ${errorMessage(err)}`);
    return;
  }

  const joined = () => results.join(ctx.eol + ctx.eol);

  switch (output) {
    case 'replace': {
      const ok = await editor.edit((edit) => {
        ranges.forEach((range, i) => edit.replace(range, results[i]));
      });
      report(ok ? 'ok' : 'editFailed');
      if (!ok) void vscode.window.showErrorMessage(`Multitool ${title}: could not apply the edit.`);
      return;
    }
    case 'newDocument': {
      report('ok');
      const doc = await vscode.workspace.openTextDocument({
        content: joined(),
        language: tool.outputLanguage ?? 'plaintext',
      });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
      return;
    }
    case 'message': {
      report('ok');
      const text = joined();
      const pick = await vscode.window.showInformationMessage(`${title}: ${text}`, 'Copy');
      if (pick === 'Copy') await vscode.env.clipboard.writeText(text);
      return;
    }
  }
}
