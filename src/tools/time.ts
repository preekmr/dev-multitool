import { defineTool, ToolError } from '../core/tool';

/** Parses a Unix timestamp in seconds, milliseconds or microseconds. */
export function fromUnix(input: string): Date {
  const trimmed = input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new ToolError('Expected a numeric Unix timestamp.');
  const n = Number(trimmed);
  const abs = Math.abs(n);
  const ms = abs >= 1e14 ? n / 1000 : abs >= 1e11 ? n : n * 1000;
  return new Date(ms);
}

export const timeTools = [
  defineTool({
    id: 'time.unixToIso',
    category: 'Time',
    title: 'Unix Timestamp to ISO 8601',
    description: 'Seconds, milliseconds or microseconds are detected automatically',
    run: (input) => fromUnix(input).toISOString(),
  }),
  defineTool({
    id: 'time.isoToUnix',
    category: 'Time',
    title: 'Date to Unix Timestamp (seconds)',
    description: 'Any date string JavaScript can parse, e.g. 2024-05-01T10:00:00Z',
    run: (input) => {
      const ms = Date.parse(input.trim());
      if (Number.isNaN(ms)) throw new ToolError('Could not parse that date.');
      return String(Math.floor(ms / 1000));
    },
  }),
  defineTool({
    id: 'time.insertIso',
    category: 'Time',
    title: 'Insert Current ISO Timestamp',
    input: 'none',
    run: () => new Date().toISOString(),
  }),
  defineTool({
    id: 'time.insertUnix',
    category: 'Time',
    title: 'Insert Current Unix Timestamp',
    input: 'none',
    run: () => String(Math.floor(Date.now() / 1000)),
  }),
];
