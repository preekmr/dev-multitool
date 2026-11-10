/**
 * Regenerates package.json `contributes` and the tool table in README.md from src/tools.
 *   npm run sync            write changes
 *   npm run check:manifest  fail (exit 1) if files are out of date — used in CI
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tools } from '../src/tools';
import { validateTools } from '../src/core/validate';
import { buildContributes, buildToolTable } from './manifest';

const root = resolve(__dirname, '..');
const check = process.argv.includes('--check');

const problems = validateTools(tools);
if (problems.length > 0) {
  console.error('Tool registry problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}

const stale: string[] = [];

function update(file: string, next: string) {
  const path = resolve(root, file);
  const current = readFileSync(path, 'utf8');
  if (current === next) return;
  if (check) stale.push(file);
  else {
    writeFileSync(path, next);
    console.log(`updated ${file}`);
  }
}

// package.json
const pkgPath = resolve(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.contributes = buildContributes(tools);
update('package.json', JSON.stringify(pkg, null, 2) + '\n');

// README.md tool table
const START = '<!-- tools:start -->';
const END = '<!-- tools:end -->';
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
const s = readme.indexOf(START);
const e = readme.indexOf(END);
if (s === -1 || e === -1) {
  console.error(`README.md must contain ${START} and ${END} markers.`);
  process.exit(1);
}
update('README.md', readme.slice(0, s + START.length) + '\n' + buildToolTable(tools) + '\n' + readme.slice(e));

if (stale.length > 0) {
  console.error(`Out of date: ${stale.join(', ')}. Run "npm run sync" and commit the result.`);
  process.exit(1);
}
console.log(`${tools.length} tools ${check ? 'in sync' : 'synced'}.`);
