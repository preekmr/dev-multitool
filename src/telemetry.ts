/**
 * Anonymous usage and error telemetry, sent to PostHog (https://posthog.com).
 *
 * Follows the user's VS Code `telemetry.telemetryLevel` setting through vscode.TelemetryLogger:
 *   "all"             → tool runs + errors
 *   "error" / "crash" → errors only
 *   "off"             → nothing
 * It is also off for local builds: the PostHog key is injected at release build time
 * (see esbuild.mjs and .github/workflows/release.yml), and off in development/test mode.
 *
 * What is sent is listed in the README ("Telemetry") and limited by src/core/telemetry-format.ts.
 */
import * as vscode from 'vscode';
import {
  batchBody,
  cleanProperties,
  exceptionProperties,
  type PostHogEvent,
  type ToolRunEvent,
} from './core/telemetry-format';

// Replaced by esbuild `define` in release builds. Empty → telemetry disabled.
declare const __POSTHOG_KEY__: string;
declare const __POSTHOG_HOST__: string;
const POSTHOG_KEY = typeof __POSTHOG_KEY__ === 'string' ? __POSTHOG_KEY__ : '';
const POSTHOG_HOST = typeof __POSTHOG_HOST__ === 'string' && __POSTHOG_HOST__ ? __POSTHOG_HOST__ : 'https://us.i.posthog.com';

const FLUSH_AT = 20;
const FLUSH_INTERVAL_MS = 60_000;
const MAX_QUEUE = 500;
const REQUEST_TIMEOUT_MS = 10_000;

let logger: vscode.TelemetryLogger | undefined;

class PostHogSender implements vscode.TelemetrySender {
  private queue: PostHogEvent[] = [];
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly apiKey: string,
    private readonly host: string,
    private readonly distinctId: string,
    private readonly extensionRoot: string,
    /** Editor name, e.g. "Visual Studio Code", "Cursor", "VSCodium". */
    private readonly editor: string,
  ) {
    this.timer = setInterval(() => void this.send(), FLUSH_INTERVAL_MS);
    // Don't keep the extension host alive just for telemetry.
    this.timer.unref?.();
  }

  sendEventData(eventName: string, data?: Record<string, unknown>): void {
    // TelemetryLogger prefixes names with the extension id ("preekmr.dev-multitool/tool.run").
    try {
      const event = eventName.slice(eventName.lastIndexOf('/') + 1);
      this.enqueue(event, cleanProperties(data ?? {}));
    } catch {
      // ignore
    }
  }

  sendErrorData(error: Error, data?: Record<string, unknown>): void {
    try {
      this.enqueue('$exception', {
        ...cleanProperties(data ?? {}),
        ...exceptionProperties(error, this.extensionRoot),
      });
      void this.send(); // errors go out right away
    } catch {
      // ignore
    }
  }

  async flush(): Promise<void> {
    clearInterval(this.timer);
    await this.send();
  }

  private enqueue(event: string, properties: Record<string, unknown>): void {
    try {
      this.push(event, properties);
    } catch {
      // ignore
    }
  }

  private push(event: string, properties: Record<string, unknown>): void {
    if (this.queue.length >= MAX_QUEUE) return;
    this.queue.push({
      event,
      distinct_id: this.distinctId,
      // Anonymous events: PostHog creates no person profile and does no IP geolocation.
      properties: { ...properties, editor: this.editor, $process_person_profile: false, $geoip_disable: true, $lib: 'dev-multitool' },
      timestamp: new Date().toISOString(),
    });
    if (this.queue.length >= FLUSH_AT) void this.send();
  }

  private async send(): Promise<void> {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, this.queue.length);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      await fetch(`${this.host}/batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: batchBody(this.apiKey, events),
        signal: controller.signal,
      });
    } catch {
      // Offline or blocked: drop the batch. Telemetry must never affect the user.
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Telemetry must never affect the extension: every entry point below catches everything.
 * If setup fails, telemetry is simply off; if sending fails, the event is dropped.
 */
export function initTelemetry(context: vscode.ExtensionContext): void {
  try {
    if (!POSTHOG_KEY) return;
    if (context.extensionMode !== vscode.ExtensionMode.Production) return;
    if (typeof fetch !== 'function' || typeof vscode.env.createTelemetryLogger !== 'function') return;

    const sender = new PostHogSender(
      POSTHOG_KEY,
      POSTHOG_HOST,
      vscode.env.machineId, // anonymous, per-install id provided by VS Code
      context.extensionUri.fsPath,
      vscode.env.appName,
    );
    // TelemetryLogger adds common properties (extension version, VS Code version, OS)
    // and reports unhandled errors thrown from this extension's code.
    logger = vscode.env.createTelemetryLogger(sender);
    context.subscriptions.push(logger);
  } catch {
    logger = undefined;
  }
}

export function trackToolRun(event: ToolRunEvent): void {
  try {
    logger?.logUsage('tool.run', { ...event });
  } catch {
    // ignore
  }
}

export function trackBug(err: unknown, toolId: string): void {
  try {
    logger?.logError(err instanceof Error ? err : new Error(String(err)), { toolId });
  } catch {
    // ignore
  }
}
