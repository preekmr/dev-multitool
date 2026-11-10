import { defineTool, ToolError } from '../core/tool';
import { decodeUtf8, indentString } from '../core/util';

const TIME_CLAIMS = ['exp', 'nbf', 'iat', 'auth_time'] as const;

function decodeSegment(segment: string, name: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(segment)) throw new ToolError(`JWT ${name} is not Base64URL.`);
  const text = decodeUtf8(Buffer.from(segment, 'base64url'), `JWT ${name}`);
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object') throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ToolError(`JWT ${name} is not a JSON object.`);
  }
}

export function decodeJwt(token: string, now: Date = new Date()) {
  const clean = token.trim().replace(/^Bearer\s+/i, '');
  const parts = clean.split('.');
  if (parts.length === 5) throw new ToolError('This looks like an encrypted JWE token; only signed JWTs (JWS) can be decoded.');
  if (parts.length !== 3) throw new ToolError('A JWT has three dot-separated parts: header.payload.signature.');

  const header = decodeSegment(parts[0], 'header');
  const payload = decodeSegment(parts[1], 'payload');

  const times: Record<string, string> = {};
  for (const claim of TIME_CLAIMS) {
    const value = payload[claim];
    if (typeof value === 'number') times[claim] = new Date(value * 1000).toISOString();
  }

  let status = 'no expiry (exp) claim';
  if (typeof payload.exp === 'number') {
    const diff = Math.round(payload.exp - now.getTime() / 1000);
    status = diff >= 0 ? `valid for another ${formatDuration(diff)}` : `expired ${formatDuration(-diff)} ago`;
  }

  return {
    header,
    payload,
    signature: parts[2],
    info: { status, ...times, note: 'Signature is NOT verified.' },
  };
}

function formatDuration(seconds: number): string {
  const units: [string, number][] = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ];
  const out: string[] = [];
  let rest = seconds;
  for (const [label, size] of units) {
    const n = Math.floor(rest / size);
    if (n > 0 || (label === 's' && out.length === 0)) out.push(`${n}${label}`);
    rest -= n * size;
    if (out.length === 2) break;
  }
  return out.join(' ');
}

export const jwtTools = [
  defineTool({
    id: 'jwt.decode',
    category: 'JWT',
    title: 'Decode',
    description: 'Decode header and payload, show expiry in human time (no signature check)',
    output: 'newDocument',
    outputLanguage: 'json',
    run: (input, ctx) => JSON.stringify(decodeJwt(input), null, indentString(ctx)),
  }),
];
