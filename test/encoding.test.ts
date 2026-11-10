import { describe, expect, it } from 'vitest';
import { run } from './helpers';

describe('Base64', () => {
  it('round-trips unicode', async () => {
    const encoded = await run('base64.encode', 'héllo wörld 🚀');
    expect(encoded).toBe('aMOpbGxvIHfDtnJsZCDwn5qA');
    expect(await run('base64.decode', encoded)).toBe('héllo wörld 🚀');
  });

  it('ignores whitespace and rejects garbage', async () => {
    expect(await run('base64.decode', 'aGVs\nbG8=')).toBe('hello');
    await expect(run('base64.decode', 'not base64!')).rejects.toThrow(/not valid Base64/);
    await expect(run('base64.decode', '/w==')).rejects.toThrow(/UTF-8/);
  });

  it('supports the URL-safe alphabet', async () => {
    expect(await run('base64.urlEncode', '??>>')).toBe('Pz8-Pg');
    expect(await run('base64.urlDecode', 'Pz8-Pg')).toBe('??>>');
  });
});

describe('URL', () => {
  it('encodes and decodes components', async () => {
    expect(await run('url.encode', 'a b&c=d/é')).toBe('a%20b%26c%3Dd%2F%C3%A9');
    expect(await run('url.decode', 'a%20b+c%26')).toBe('a b c&');
    await expect(run('url.decode', '%E0%A4%A')).rejects.toThrow(/malformed/);
  });

  it('parses a URL into JSON, collecting repeated params', async () => {
    const parsed = JSON.parse(await run('url.parse', 'https://user@api.example.com:8443/v1/items?q=a&tag=x&tag=y#top'));
    expect(parsed).toMatchObject({
      protocol: 'https',
      username: 'user',
      host: 'api.example.com',
      port: '8443',
      path: '/v1/items',
      query: { q: 'a', tag: ['x', 'y'] },
      hash: 'top',
    });
  });
});

describe('HTML', () => {
  it('escapes and unescapes entities', async () => {
    expect(await run('html.encode', `<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
    expect(await run('html.decode', '&lt;b&gt; &amp;amp; &#169; &#x1F680; &unknown;')).toBe('<b> &amp; © 🚀 &unknown;');
  });
});

describe('Hex', () => {
  it('round-trips and accepts common separators', async () => {
    expect(await run('hex.encode', 'Hi!')).toBe('486921');
    expect(await run('hex.decode', '0x48 0x69:21')).toBe('Hi!');
    await expect(run('hex.decode', 'abc')).rejects.toThrow(/hexadecimal/);
  });
});

describe('Hash', () => {
  it('computes digests', async () => {
    expect(await run('hash.md5', 'hello')).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(await run('hash.sha1', 'hello')).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    expect(await run('hash.sha256', 'hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(await run('hash.sha512', 'hello')).toBe(
      '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043',
    );
  });

  it('hashes UTF-8 bytes, not UTF-16 code units', async () => {
    // Independent reference: printf 'é' | md5sum  (bytes c3 a9)
    expect(await run('hash.md5', 'é')).toBe('66ddcd97cfdeabb2f6fb8a999b4bc76f');
  });
});
