import { describe, expect, it } from 'vitest';
import { decodeJwt } from '../src/tools/jwt';
import { run } from './helpers';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '42', iat: 1700000000, exp: 1700003600 })}.sig`;

describe('JWT', () => {
  it('decodes header, payload and time claims', () => {
    const result = decodeJwt(`Bearer ${token}`, new Date(1700000000 * 1000));
    expect(result.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(result.payload.sub).toBe('42');
    expect(result.info).toMatchObject({
      status: 'valid for another 1h',
      iat: '2023-11-14T22:13:20.000Z',
      exp: '2023-11-14T23:13:20.000Z',
    });
  });

  it('reports expired tokens', () => {
    expect(decodeJwt(token, new Date(1700090060 * 1000)).info.status).toBe('expired 1d 1m ago');
  });

  it('produces JSON from the tool and rejects non-JWTs', async () => {
    expect(JSON.parse(await run('jwt.decode', token)).payload.sub).toBe('42');
    await expect(run('jwt.decode', 'abc.def')).rejects.toThrow(/three dot-separated parts/);
    await expect(run('jwt.decode', 'a.b.c.d.e')).rejects.toThrow(/JWE/);
  });
});
