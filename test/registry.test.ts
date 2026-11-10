import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tools } from '../src/tools';
import { validateTools } from '../src/core/validate';
import { buildContributes } from '../scripts/manifest';

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
});
