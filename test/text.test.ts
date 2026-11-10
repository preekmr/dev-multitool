import { describe, expect, it } from 'vitest';
import { words } from '../src/tools/case';
import { run } from './helpers';

describe('Case', () => {
  it('splits identifiers into words', () => {
    expect(words('parseHTTPServerResponse')).toEqual(['parse', 'HTTP', 'Server', 'Response']);
    expect(words('user_id-and some.thing')).toEqual(['user', 'id', 'and', 'some', 'thing']);
  });

  it('converts between cases', async () => {
    expect(await run('case.camel', 'user_first_name')).toBe('userFirstName');
    expect(await run('case.pascal', 'user-first-name')).toBe('UserFirstName');
    expect(await run('case.snake', 'userFirstName')).toBe('user_first_name');
    expect(await run('case.constant', 'userFirstName')).toBe('USER_FIRST_NAME');
    expect(await run('case.kebab', 'UserFirstName')).toBe('user-first-name');
    expect(await run('case.title', 'user_first_name')).toBe('User First Name');
  });

  it('converts each line separately and keeps indentation', async () => {
    expect(await run('case.snake', '  fooBar\nbazQux\n')).toBe('  foo_bar\nbaz_qux\n');
  });
});

describe('Lines', () => {
  it('sorts naturally and preserves CRLF and the final newline', async () => {
    expect(await run('lines.sort', 'file10\r\nfile2\r\nFile1\r\n', { eol: '\r\n' })).toBe('File1\r\nfile2\r\nfile10\r\n');
  });

  it('dedupes, reverses, removes blanks and trims', async () => {
    expect(await run('lines.unique', 'a\nb\na\nc')).toBe('a\nb\nc');
    expect(await run('lines.reverse', '1\n2\n3')).toBe('3\n2\n1');
    expect(await run('lines.removeBlank', 'a\n\n  \nb')).toBe('a\nb');
    expect(await run('lines.trim', '  a  \n\tb')).toBe('a\nb');
  });

  it('counts', async () => {
    expect(await run('lines.count', 'hello world\nhé')).toBe('2 lines, 3 words, 14 characters, 15 bytes (UTF-8)');
  });
});

describe('Time & Generate', () => {
  it('converts timestamps in seconds, ms and µs', async () => {
    expect(await run('time.unixToIso', '1700000000')).toBe('2023-11-14T22:13:20.000Z');
    expect(await run('time.unixToIso', '1700000000000')).toBe('2023-11-14T22:13:20.000Z');
    expect(await run('time.unixToIso', '1700000000000000')).toBe('2023-11-14T22:13:20.000Z');
    expect(await run('time.isoToUnix', '2023-11-14T22:13:20Z')).toBe('1700000000');
    await expect(run('time.isoToUnix', 'not a date')).rejects.toThrow(/parse/);
  });

  it('generates UUIDs', async () => {
    expect(await run('generate.uuid', '')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
