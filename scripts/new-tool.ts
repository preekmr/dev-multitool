/**
 * Scaffolds a new tool.
 *   npm run new-tool -- <id> "<Category>" "<Title>"
 *   npm run new-tool -- color.hexToRgb "Color" "Hex to RGB"
 *
 * Creates src/tools/<file>.ts (or appends to it), registers it in src/tools/index.ts,
 * adds a test stub, and runs the manifest sync.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [id, category, title] = process.argv.slice(2);
if (!id || !category || !title || !/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/.test(id)) {
  console.error('Usage: npm run new-tool -- <category.action> "<Category>" "<Title>"');
  process.exit(1);
}

const root = resolve(__dirname, '..');
const file = id.split('.')[0];
const exportName = `${file}Tools`;
const toolPath = resolve(root, 'src/tools', `${file}.ts`);

const toolSnippet = `  defineTool({
    id: '${id}',
    category: '${category}',
    title: '${title}',
    description: 'TODO: one-line description',
    run: (input) => {
      // TODO: implement. Throw new ToolError('message') for invalid input.
      return input;
    },
  }),
`;

if (existsSync(toolPath)) {
  const src = readFileSync(toolPath, 'utf8');
  const marker = src.lastIndexOf('];');
  if (marker === -1) {
    console.error(`Could not find the tool array in ${toolPath}; add this manually:\n\n${toolSnippet}`);
    process.exit(1);
  }
  writeFileSync(toolPath, src.slice(0, marker) + toolSnippet + src.slice(marker));
  console.log(`added ${id} to src/tools/${file}.ts`);
} else {
  writeFileSync(
    toolPath,
    `// Import ToolError from '../core/tool' as well to report invalid input.\nimport { defineTool } from '../core/tool';\n\nexport const ${exportName} = [\n${toolSnippet}];\n`,
  );
  const indexPath = resolve(root, 'src/tools/index.ts');
  let index = readFileSync(indexPath, 'utf8');
  index = index.replace(/(\nexport const tools)/, `import { ${exportName} } from './${file}';\n$1`);
  index = index.replace(/\n\];\s*$/, `\n  ...${exportName},\n];\n`);
  writeFileSync(indexPath, index);
  console.log(`created src/tools/${file}.ts and registered it in src/tools/index.ts`);

  const testPath = resolve(root, 'test', `${file}.test.ts`);
  if (!existsSync(testPath)) {
    writeFileSync(
      testPath,
      `import { describe, expect, it } from 'vitest';\nimport { run } from './helpers';\n\ndescribe('${category}', () => {\n  it('${title}', async () => {\n    expect(await run('${id}', 'input')).toBe('input');\n  });\n});\n`,
    );
    console.log(`created test/${file}.test.ts`);
  }
}

execSync('npm run --silent sync', { cwd: root, stdio: 'inherit' });
