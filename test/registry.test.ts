import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tools } from '../src/tools';
import { validateTools } from '../src/core/validate';
import { buildContributes } from '../scripts/manifest';
import { COMPARE_COMMANDS } from '../src/compare/commands';

describe('registry', () => {
  it('has valid, unique tool ids', () => {
    expect(validateTools(tools)).toEqual([]);
  });

  it('package.json is in sync with the registry (run "npm run sync" if this fails)', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.contributes).toEqual(JSON.parse(JSON.stringify(buildContributes(tools))));
  });

  it('every tool command is contributed and has a context-menu entry', () => {
    const { commands, menus } = buildContributes(tools);
    const ids = new Set(commands.map((c) => c.command));
    const inMenus = new Set(
      Object.values(menus)
        .flat()
        .map((m) => (m as { command?: string }).command),
    );
    for (const tool of tools) {
      expect(ids.has(`multitool.${tool.id}`)).toBe(true);
      expect(inMenus.has(`multitool.${tool.id}`)).toBe(true);
    }
  });

  it('every tool is exercised by at least one test', () => {
    const testDir = __dirname;
    const testSources = readdirSync(testDir)
      .filter((f) => f.endsWith('.test.ts') && f !== 'registry.test.ts')
      .map((f) => readFileSync(resolve(testDir, f), 'utf8'))
      .join('\n');
    const untested = tools.filter((t) => !testSources.includes(`'${t.id}'`)).map((t) => t.id);
    expect(untested, 'Add a test that calls run(<id>, ...) for each of these tools').toEqual([]);
  });

  it('JSON Compare commands are contributed and reachable from menus', () => {
    const { commands, menus } = buildContributes(tools);
    const ids = new Set(commands.map((c) => c.command));
    for (const c of COMPARE_COMMANDS) expect(ids.has(c.command)).toBe(true);
    const where = (cmd: string) =>
      Object.entries(menus)
        .filter(([, items]) => items.some((m) => (m as { command?: string }).command === cmd))
        .map(([menu]) => menu);
    expect(where('multitool.jsonCompare.compareWith')).toEqual(
      expect.arrayContaining(['commandPalette', 'editor/title/context', 'multitool.context.json']),
    );
    expect(where('multitool.jsonCompare.compareSelected')).toEqual(expect.arrayContaining(['explorer/context']));
  });
});
