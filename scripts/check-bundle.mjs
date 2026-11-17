/**
 * Smoke test for the built bundle (dist/extension.js): loads it with a stub `vscode` module,
 * activates it, and checks that every command declared in package.json gets registered.
 * Catches bundling problems unit tests cannot see (e.g. a dependency that fails to load).
 *   npm run build && npm run check:bundle
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const Module = require('node:module');

const registered = new Set();
// A stub that answers any property access, so activation code runs without a real VS Code.
const stub = (name) =>
  new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? undefined : prop === Symbol.toPrimitive ? () => name : stub(`${name}.${String(prop)}`)),
    apply: () => stub(`${name}()`),
    construct: () => stub(`new ${name}`),
  });
// The bundle copies the module's own properties at load time, so name the API members it uses.
const API = [
  'window', 'workspace', 'env', 'languages', 'extensions', 'Uri', 'Range', 'Position', 'Selection',
  'EndOfLine', 'ViewColumn', 'QuickPickItemKind', 'TextEditorRevealType', 'TabInputText', 'ExtensionMode',
  'ThemeIcon', 'ThemeColor', 'EventEmitter', 'TreeItem', 'TreeItemCollapsibleState', 'MarkdownString', 'Disposable',
];
const vscode = {
  ...Object.fromEntries(API.map((name) => [name, stub(`vscode.${name}`)])),
  commands: {
    registerCommand: (id) => {
      registered.add(id);
      return { dispose() {} };
    },
    executeCommand: async () => undefined,
  },
};

const load = Module._load;
Module._load = function (request, ...rest) {
  return request === 'vscode' ? vscode : load.call(this, request, ...rest);
};

const ext = require('../dist/extension.js');
ext.activate({ subscriptions: [], workspaceState: { get() {}, update() {} }, extensionMode: 3, extensionUri: { fsPath: '/' } });

const declared = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).contributes.commands.map((c) => c.command);
const missing = declared.filter((c) => !registered.has(c));
if (missing.length > 0) {
  console.error(`Bundle check failed. Commands declared but not registered: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Bundle OK: ${registered.size} commands registered.`);
