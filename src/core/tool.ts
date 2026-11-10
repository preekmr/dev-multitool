/**
 * The tool contract. Every operation in Dev Multitool is a `Tool`.
 *
 * Tools are plain, editor-agnostic functions: they receive a string and return a string.
 * They must NOT import `vscode`, so they can be unit-tested with plain Node and reused
 * by the manifest generator.
 */

/** Where the result of a tool goes. */
export type OutputMode =
  /** Replace the selection (or the whole document when nothing is selected). Default. */
  | 'replace'
  /** Open the result in a new untitled editor beside the current one. */
  | 'newDocument'
  /** Show the result in a notification (with a "Copy" button). Good for counts / short info. */
  | 'message';

export interface ToolContext {
  /** Indentation to use for pretty-printing: number of spaces, or '\t'. */
  indent: number | '\t';
  /** End-of-line sequence of the current document. */
  eol: '\n' | '\r\n';
}

export interface KeybindingSpec {
  /** Default key on Windows/Linux, e.g. "ctrl+alt+b". */
  key: string;
  /** Default key on macOS, e.g. "cmd+alt+b". Falls back to `key`. */
  mac?: string;
}

export interface Tool {
  /**
   * Stable, unique id in the form `<category>.<action>`, e.g. `base64.encode`.
   * The VS Code command id becomes `multitool.<id>`. Never change it after release:
   * users' keybindings refer to it.
   */
  id: string;
  /** Category shown in menus and the palette, e.g. "Base64". */
  category: string;
  /** Short action name, read after the category: "Base64 Encode", "JSON Format". */
  title: string;
  /** One-line description shown in the Multitool picker. */
  description?: string;
  /** Default: 'replace'. */
  output?: OutputMode;
  /**
   * 'text' (default): the tool transforms the selection / document.
   * 'none': the tool generates content (UUID, timestamp) and inserts it at each cursor.
   */
  input?: 'text' | 'none';
  /** Language id for `newDocument` output, e.g. 'json'. */
  outputLanguage?: string;
  /** Optional default keybinding. Users can bind any tool themselves too. */
  keybinding?: KeybindingSpec;
  run(input: string, ctx: ToolContext): string | Promise<string>;
}

/** Thrown by tools for expected, user-facing failures (invalid input etc.). */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Identity helper that gives type-checking and autocompletion when defining tools. */
export function defineTool(tool: Tool): Tool {
  return tool;
}

export const COMMAND_PREFIX = 'multitool.';

export function commandId(tool: Pick<Tool, 'id'>): string {
  return COMMAND_PREFIX + tool.id;
}

export function displayTitle(tool: Pick<Tool, 'category' | 'title'>): string {
  return `${tool.category} ${tool.title}`;
}

export const DEFAULT_CONTEXT: ToolContext = { indent: 2, eol: '\n' };
