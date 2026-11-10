# Contributing to Dev Multitool

Thanks for helping! Most contributions are new tools, and a tool is just a function from string to string.

## Setup

```bash
npm install
npm test          # unit tests (no VS Code needed)
npm run build     # bundle to dist/extension.js
```

Press `F5` in VS Code to launch an Extension Development Host with your local build.

## Project layout

```
src/
  core/
    tool.ts       # the Tool contract (defineTool, ToolError, output modes)
    runner.ts     # VS Code glue: selections, whole document, multi-cursor, output
    picker.ts     # the "Multitool: Run Tool…" quick pick
    util.ts       # shared helpers (JSON parsing with line/column, line handling, UTF-8)
  tools/
    index.ts      # the registry — every tool is listed here
    json.ts, base64.ts, jwt.ts, …   # one file per category
  extension.ts    # registers one command per tool + the picker commands
scripts/
  sync-manifest.ts  # generates package.json "contributes" + README tool table
  new-tool.ts       # scaffolds a new tool
test/               # vitest unit tests for the tools
```

Tools never import `vscode`. That keeps them trivially testable and lets the manifest generator load them.

## Adding a tool

### The quick way

```bash
npm run new-tool -- color.hexToRgb "Color" "Hex to RGB"
```

This creates (or extends) `src/tools/color.ts`, registers it in `src/tools/index.ts`, adds a test stub and
regenerates `package.json`. Then implement `run` and the test.

### By hand

1. Add a `defineTool` entry to the category's file in `src/tools/` (or create a new file and add it to
   `src/tools/index.ts`):

   ```ts
   defineTool({
     id: 'base64.encode',          // → command id "multitool.base64.encode". Never rename after release.
     category: 'Base64',           // groups the tool in menus and the picker
     title: 'Encode',              // palette shows "Multitool: Base64 Encode"
     description: 'Encode text (UTF-8) as Base64',
     run: (input, ctx) => Buffer.from(input, 'utf8').toString('base64'),
   }),
   ```

2. Run `npm run sync`. This writes the command, its context-menu entry, any default keybinding, and the README
   table. CI fails if you forget (`npm run check:manifest`).
3. Add tests in `test/`.

### Tool options

| Field | Meaning |
| --- | --- |
| `output` | `'replace'` (default) replaces the selection/document; `'newDocument'` opens a new tab; `'message'` shows a notification with a Copy button. |
| `outputLanguage` | Language of the new tab for `newDocument`, e.g. `'json'`. |
| `input` | `'none'` for generators (UUID, timestamp): the result is inserted at each cursor. |
| `keybinding` | Optional default key, e.g. `{ key: 'ctrl+alt+u', mac: 'cmd+alt+u' }`. Use sparingly — users can bind any tool themselves. |
| `run(input, ctx)` | Can be async. `ctx.indent` is the indentation to use, `ctx.eol` the document line ending. |

For invalid input, `throw new ToolError('Helpful message')`. The runner shows it to the user and leaves the text
untouched. Helpers in `src/core/util.ts` cover JSON parsing with line/column errors, line-based transforms that keep
the line ending and final newline, and strict UTF-8 decoding.

### Guidelines

- Keep tools offline and synchronous-fast. No network access.
- Prefer Node built-ins. If you add a dependency, keep it small: it is bundled into the extension.
- Errors should tell the user what was expected, not just that something failed.

## Releasing (maintainers)

Releases are published to the VS Code Marketplace by `.github/workflows/release.yml` using Trusted Publishing
(no tokens). To release:

1. Add a `## X.Y.Z — YYYY-MM-DD` section at the top of `CHANGELOG.md` with the changes. (Don't leave an empty "Unreleased" heading in the file: the Marketplace shows the changelog as-is.)
2. Bump the version: `npm version patch --no-git-tag-version` (or `minor` / `major`), commit and push to `main`.
3. On GitHub: **Actions → Release → Run workflow** (branch `main`).

The workflow runs the checks, publishes, creates the `vX.Y.Z` tag and a GitHub release with the `.vsix`.
When it succeeds, `.github/workflows/openvsx.yml` publishes the same `.vsix` to [Open VSX](https://open-vsx.org)
(needs the `OVSX_PAT` repository secret). Run that workflow by hand to retry or to publish an older release.
Pushing a matching `vX.Y.Z` tag yourself (`npm version patch && git push --follow-tags`) works too.

## Pull requests

- `npm run typecheck && npm test && npm run check:manifest` must pass.
- Mention user-visible changes in the PR description; they go into `CHANGELOG.md` at release time.
