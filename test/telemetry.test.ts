/**
 * Telemetry must never affect the extension: setup failures, logger failures,
 * network errors and hung requests are all absorbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  createLogger: undefined as undefined | ((sender: any) => any),
}));

vi.mock('vscode', () => ({
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  env: {
    machineId: 'machine',
    appName: 'Cursor',
    createTelemetryLogger: (sender: unknown) => fake.createLogger!(sender),
  },
}));

const context = () =>
  ({ extensionMode: 1, extensionUri: { fsPath: '/ext' }, subscriptions: [] as unknown[] }) as any;

const event = {
  toolId: 'json.format',
  source: 'command',
  ranges: 1,
  wholeDocument: true,
  outputMode: 'replace',
  outcome: 'ok',
  durationMs: 1,
} as const;

async function load() {
  vi.resetModules();
  return import('../src/telemetry');
}

describe('telemetry failures never surface', () => {
  beforeEach(() => vi.stubGlobal('__POSTHOG_KEY__', 'phc_test'));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('survives createTelemetryLogger throwing', async () => {
    fake.createLogger = () => {
      throw new Error('not supported in this editor');
    };
    const t = await load();
    expect(() => t.initTelemetry(context())).not.toThrow();
    expect(() => t.trackToolRun(event)).not.toThrow();
    expect(() => t.trackBug(new Error('x'), 'json.format')).not.toThrow();
  });

  it('survives the logger throwing', async () => {
    fake.createLogger = () => ({
      logUsage: () => {
        throw new Error('boom');
      },
      logError: () => {
        throw new Error('boom');
      },
      dispose: () => undefined,
    });
    const t = await load();
    t.initTelemetry(context());
    expect(() => t.trackToolRun(event)).not.toThrow();
    expect(() => t.trackBug(new TypeError('x'), 'json.format')).not.toThrow();
  });

  it('drops events when the network fails, without unhandled rejections', async () => {
    let sender: any;
    fake.createLogger = (s) => {
      sender = s;
      return {
        logUsage: (name: string, data: object) => s.sendEventData(`preekmr.dev-multitool/${name}`, data),
        logError: (err: Error, data: object) => s.sendErrorData(err, data),
        dispose: () => undefined,
      };
    };
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    const t = await load();
    t.initTelemetry(context());
    for (let i = 0; i < 25; i++) t.trackToolRun(event); // crosses the batch size → sends
    t.trackBug(new TypeError('x'), 'json.format'); // errors send immediately
    await sender.flush();
    await new Promise((r) => setTimeout(r, 10));

    process.off('unhandledRejection', unhandled);
    expect(fetchMock).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.batch[0]).toMatchObject({ event: 'tool.run', properties: { toolId: 'json.format', editor: 'Cursor' } });
  });

  it('gives up on a hung request instead of waiting forever', async () => {
    vi.useFakeTimers();
    let sender: any;
    fake.createLogger = (s) => {
      sender = s;
      return { logUsage: (n: string, d: object) => s.sendEventData(n, d), logError: () => undefined, dispose: () => undefined };
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
      ),
    );
    const t = await load();
    t.initTelemetry(context());
    t.trackToolRun(event);
    const done = sender.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(done).resolves.toBeUndefined();
  });

  it('is off when no key was built in', async () => {
    vi.unstubAllGlobals();
    const create = vi.fn();
    fake.createLogger = create;
    const t = await load();
    t.initTelemetry(context());
    t.trackToolRun(event);
    expect(create).not.toHaveBeenCalled();
  });
});
