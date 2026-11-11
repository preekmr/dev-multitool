/**
 * Pure helpers for telemetry: event shapes, PostHog payloads and privacy scrubbing.
 * No `vscode` import, so this is unit-tested with plain Node.
 *
 * Privacy rules enforced here:
 * - Never send text the user is working on, file names or paths.
 * - Error messages are dropped (they can quote the user's input); only the error type is kept.
 * - Stack frames keep only file names inside the extension; anything else becomes "<external>".
 */

/** How the tool was started. Command-palette, keybinding and context-menu runs all go through
 * the per-tool command, so VS Code cannot tell them apart; they share 'command'. */
export type RunSource = 'command' | 'picker' | 'pickerNewTab' | 'repeatLast';

/** ok = output applied; inputError = ToolError (invalid input, expected); bug = anything else. */
export type RunOutcome = 'ok' | 'inputError' | 'bug' | 'editFailed';

export interface ToolRunEvent {
  toolId: string;
  source: RunSource;
  /** Number of ranges processed (selections, or 1 for the whole document). */
  ranges: number;
  /** True when nothing was selected and the whole document was processed. */
  wholeDocument: boolean;
  outputMode: string;
  outcome: RunOutcome;
  /** Time spent inside tool.run, in ms. Excludes UI such as notifications. */
  durationMs: number;
  /** Error class name for non-ok outcomes, e.g. "TypeError". Never the message. */
  errorType?: string;
}

export interface PostHogEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

export interface StackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
  platform: 'node:javascript';
}

const MAX_FRAMES = 30;

// "    at fn (file:line:col)"  |  "    at file:line:col"  |  "    at async fn (file:line:col)"
const FRAME_WITH_FN = /^\s*at (?:async )?(.+?) \((.+?):(\d+):(\d+)\)$/;
const FRAME_NO_FN = /^\s*at (?:async )?(.+?):(\d+):(\d+)$/;

function normalizePath(p: string): string {
  return p.replace(/^file:\/\//, '').replace(/\\/g, '/');
}

/**
 * Parses a V8 stack into PostHog frames (oldest call first, as PostHog expects).
 * Files under `extensionRoot` are kept relative to it and marked in_app; every other file name
 * is replaced, so user names in paths never leave the machine.
 */
export function parseStack(stack: string | undefined, extensionRoot: string): StackFrame[] {
  if (!stack) return [];
  const root = normalizePath(extensionRoot).replace(/\/+$/, '') + '/';
  const frames: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    let fn: string;
    let file: string;
    let lineNo: string;
    let col: string;
    const withFn = FRAME_WITH_FN.exec(line);
    if (withFn) {
      [, fn, file, lineNo, col] = withFn;
    } else {
      const noFn = FRAME_NO_FN.exec(line);
      if (!noFn) continue;
      fn = '?';
      [, file, lineNo, col] = noFn;
    }
    const normalized = normalizePath(file);
    const inApp = root !== '/' && normalized.startsWith(root);
    frames.push({
      filename: inApp ? normalized.slice(root.length) : '<external>',
      function: fn,
      lineno: inApp ? Number(lineNo) : undefined,
      colno: inApp ? Number(col) : undefined,
      in_app: inApp,
      platform: 'node:javascript',
    });
  }
  return frames.slice(0, MAX_FRAMES).reverse();
}

export function errorType(err: unknown): string {
  if (err instanceof Error) return err.name || err.constructor?.name || 'Error';
  return typeof err;
}

/** Properties for a PostHog `$exception` event (Error tracking). */
export function exceptionProperties(err: unknown, extensionRoot: string): Record<string, unknown> {
  const type = errorType(err);
  const stack = err instanceof Error ? err.stack : undefined;
  return {
    $exception_level: 'error',
    $exception_list: [
      {
        type,
        // The real message may contain the user's text, so send the type only.
        value: type,
        mechanism: { type: 'generic', handled: true, synthetic: false },
        stacktrace: { type: 'raw', frames: parseStack(stack, extensionRoot) },
      },
    ],
  };
}

/** Keeps only primitive values; drops anything that looks like a path. */
export function cleanProperties(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string' && !/[\\/].*[\\/]/.test(value)) {
      out[key] = value;
    }
  }
  return out;
}

export function batchBody(apiKey: string, events: PostHogEvent[]): string {
  return JSON.stringify({ api_key: apiKey, batch: events, sent_at: new Date().toISOString() });
}
