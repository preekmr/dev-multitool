# Dev Multitool for VS Code

**Website:** [multitool.preekmr.me](https://multitool.preekmr.me)

Format, convert, encode and decode text without leaving the editor. Select some text (or nothing, to use the
whole file), open the Command Palette and type the tool name.

- **JSON** – format, minify, sort keys, validate, escape/unescape, convert to YAML
- **XML** – format, minify
- **YAML** – convert to JSON
- **Base64 / Base64URL / Hex / URL / HTML entities** – encode and decode
- **JWT** – decode header and payload, show `exp`/`iat` as dates and whether the token has expired
- **Hash** – MD5, SHA-1, SHA-256, SHA-512
- **Case** – camelCase, PascalCase, snake_case, CONSTANT_CASE, kebab-case, Title Case
- **Lines** – sort (natural), remove duplicates, reverse, remove blanks, trim, count
- **Time / Generate** – Unix ⇄ ISO 8601 conversion, insert timestamp, insert UUID

## Install

- **VS Code:** [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=preekmr.dev-multitool), or search for "Dev Multitool" in the Extensions view.
- **VSCodium, Cursor, Windsurf, Gitpod and other editors using Open VSX:** [Open VSX](https://open-vsx.org/extension/preekmr/dev-multitool).

## Usage

| How | What |
| --- | --- |
| **Command Palette** — `Cmd+Shift+P` (macOS) / `Ctrl+Shift+P`, or `Cmd+P` then type `>` | Type e.g. `base64`, `json format`, `jwt`. Every tool is listed as `Multitool: <Category> <Action>`. |
| **Multitool picker** — `Cmd+Alt+Shift+D` / `Ctrl+Alt+Shift+D` | All tools grouped by category in one searchable list (`Multitool: Run Tool…`). |
| **Right-click menu** | `Multitool` submenu with a submenu per category. Turn off with `multitool.contextMenu.enabled`. |
| **Your own keybindings** | Every tool is a command, so any of them can be bound to a key (see below). |

What the tool works on:

- **Selections** – each selection is processed separately, so multi-cursor works (e.g. Base64-decode ten values at once).
- **No selection** – the whole document is processed.
- **Generators** (UUID, timestamps) – insert at every cursor.

Where the result goes depends on the tool: most replace the text in place (undo with `Cmd+Z`), JWT decode and URL
parse open the result in a new tab, hashes/validation/counts show a notification with a **Copy** button. Use
`Multitool: Run Tool (Result in New Tab)…` to send any tool's result to a new tab instead of replacing.
`Multitool: Repeat Last Tool` re-runs the last tool you used — a good one to bind to a key.

## JSON Compare

Compare two JSON files or open tabs side by side. **Key order and formatting are ignored**, so only real
differences show.

- **From an editor:** with a JSON file or tab active, run **Multitool: JSON Compare with…** (Command Palette,
  right-click on the editor tab, or the editor's right-click menu → Multitool → JSON). Pick another open tab
  — unsaved and untitled tabs work too — or **Browse…** for a file. The picked file opens on the left.
- **From the Explorer:** select two JSON files, right-click, **Multitool: JSON Compare Selected Files**.

What you get:

- VS Code's **side-by-side diff** of both files, formatted the same way and with keys sorted. Your files are
  not changed; the diff shows read-only formatted copies.
- A **JSON Diff** panel next to the Terminal listing every change by its path, e.g.
  `~ $.user.name  "Pradeep" → "Pradeep B"`, `+ $.roles[1]  "admin"`, `− $.beta  true`, with type changes
  flagged (`string → number`). Click a change to jump to it in the diff. **Copy as Markdown** (panel title bar)
  gives you a table for a PR or ticket.

Good to know:

- JSON with comments and trailing commas (`tsconfig.json`, `settings.json`) works; comments are not compared.
- Arrays are compared item by item, by position: an item inserted near the start of an array lists every later
  item as changed in the panel (the side-by-side diff still shows just the inserted lines).
- `1` and `1.0` are equal; `null` and a missing key are different. Integers above 2^53 lose precision, as in
  JavaScript.
- Set `multitool.jsonCompare.sortKeys` to `false` to see key-order changes in the side-by-side diff.

## JSON Path and array counts

Three commands for finding your way around a JSON file. They work in JSON and JSON with comments, in a
half-written file, and in any other tab whose text is valid JSON. Find them in the Command Palette, the editor's
right-click menu → Multitool → JSON, or `Multitool: Run Tool…`.

- **Multitool: JSON Copy Path at Cursor** copies the path of the value under the cursor, e.g. `$.users[3].name`.
  On a key you get the path of its value; between items you get the path of the object or array around them.
  With several cursors you get one path per line.
- **Multitool: JSON Go to Path…** asks for a path (filled in with the one at the cursor), then selects that value
  and scrolls it into view. It reads all three styles: `$.users[3].name`, `users[3].name` and `/users/3/name`.
  If nothing is there it tells you where the path stops matching, e.g. `$.users is an array with 2 items`.
- **Multitool: JSON Count Array Items** shows how many items the array at the cursor holds (the closest one
  around the cursor, or the array of the key you're on), with a **Copy** button.

Set `multitool.json.pathStyle` to `pointer` (`/users/3/name`) or `js` (`users[3].name`) to copy paths in another
style. Keys that aren't plain identifiers are quoted: `$['a-b']`. With duplicate keys, Go to Path picks the last
one, as `JSON.parse` does. Queries such as `$..price` or `[*]` are not supported yet.

## Keybindings

Open **Preferences: Open Keyboard Shortcuts (JSON)** and add entries using the command IDs from the table below:

```jsonc
[
  { "key": "cmd+alt+j", "command": "multitool.json.format", "when": "editorTextFocus" },
  { "key": "cmd+alt+b", "command": "multitool.base64.decode", "when": "editorTextFocus" },
  { "key": "cmd+alt+r", "command": "multitool.repeatLastTool", "when": "editorTextFocus" }
]
```

Or open **Preferences: Open Keyboard Shortcuts**, search for `Multitool` and click the `+` next to any tool.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `multitool.indent` | `"auto"` | Indentation for formatters: `"auto"` follows the editor, `"tab"`, or a number of spaces. |
| `multitool.contextMenu.enabled` | `true` | Show the Multitool submenu in the editor right-click menu. |
| `multitool.jsonCompare.sortKeys` | `true` | JSON Compare: sort keys on both sides so key order never shows as a difference. |
| `multitool.json.pathStyle` | `"jsonpath"` | How JSON Copy Path at Cursor writes paths: `"jsonpath"` (`$.a[0]`), `"pointer"` (`/a/0`) or `"js"` (`a[0]`). |

## All tools

<!-- tools:start -->
| Tool | Command ID (for keybindings) | Description |
| --- | --- | --- |
| JSON Format | `multitool.json.format` | Pretty-print JSON using the editor indentation |
| JSON Minify | `multitool.json.minify` | Remove all insignificant whitespace |
| JSON Sort Keys | `multitool.json.sortKeys` | Sort object keys alphabetically (recursively) and pretty-print |
| JSON Validate | `multitool.json.validate` | Check whether the text is valid JSON |
| JSON Escape (Stringify) | `multitool.json.stringify` | Turn text into a JSON string literal: {"a":1} → "{\"a\":1}" |
| JSON Unescape (Parse String) | `multitool.json.unstringify` | Turn a JSON string literal back into its text |
| JSON to YAML | `multitool.json.toYaml` | Convert JSON to YAML |
| XML Format | `multitool.xml.format` | Pretty-print XML |
| XML Minify | `multitool.xml.minify` | Remove whitespace between tags |
| XML Validate | `multitool.xml.validate` | Check whether the text is well-formed XML |
| YAML to JSON | `multitool.yaml.toJson` | Convert YAML to JSON (multi-document YAML becomes an array) |
| Base64 Encode | `multitool.base64.encode` | Encode text (UTF-8) as Base64 |
| Base64 Decode | `multitool.base64.decode` | Decode Base64 to text (UTF-8) |
| Base64 URL-safe Encode | `multitool.base64.urlEncode` | Encode text as Base64URL (no padding, - and _) |
| Base64 URL-safe Decode | `multitool.base64.urlDecode` | Decode Base64URL to text |
| URL Encode Component | `multitool.url.encode` | Percent-encode text for use in a query parameter or path segment |
| URL Decode | `multitool.url.decode` | Decode percent-encoded text (treats + as space) |
| URL Parse to JSON | `multitool.url.parse` | Break a URL into protocol, host, path and query parameters |
| JWT Decode | `multitool.jwt.decode` | Decode header and payload, show expiry in human time (no signature check) |
| Hash MD5 | `multitool.hash.md5` | MD5 hex digest of the text (UTF-8) |
| Hash SHA-1 | `multitool.hash.sha1` | SHA-1 hex digest of the text (UTF-8) |
| Hash SHA-256 | `multitool.hash.sha256` | SHA-256 hex digest of the text (UTF-8) |
| Hash SHA-512 | `multitool.hash.sha512` | SHA-512 hex digest of the text (UTF-8) |
| HTML Escape Entities | `multitool.html.encode` | Escape & < > " ' as HTML entities |
| HTML Unescape Entities | `multitool.html.decode` | Decode named and numeric HTML entities |
| Hex Encode | `multitool.hex.encode` | Text (UTF-8) to hexadecimal bytes |
| Hex Decode | `multitool.hex.decode` | Hexadecimal bytes to text (accepts spaces, 0x and : separators) |
| Case to camelCase | `multitool.case.camel` | Convert each line to camelCase (helloWorld) |
| Case to PascalCase | `multitool.case.pascal` | Convert each line to PascalCase (HelloWorld) |
| Case to snake_case | `multitool.case.snake` | Convert each line to snake_case (hello_world) |
| Case to CONSTANT_CASE | `multitool.case.constant` | Convert each line to CONSTANT_CASE (HELLO_WORLD) |
| Case to kebab-case | `multitool.case.kebab` | Convert each line to kebab-case (hello-world) |
| Case to Title Case | `multitool.case.title` | Convert each line to Title Case (Hello World) |
| Case to UPPERCASE | `multitool.case.upper` | Convert text to upper case |
| Case to lowercase | `multitool.case.lower` | Convert text to lower case |
| Lines Sort Ascending | `multitool.lines.sort` | Natural sort (file2 before file10) |
| Lines Sort Descending | `multitool.lines.sortDesc` |  |
| Lines Remove Duplicates | `multitool.lines.unique` | Keep the first occurrence of each line |
| Lines Reverse Order | `multitool.lines.reverse` |  |
| Lines Remove Blank Lines | `multitool.lines.removeBlank` |  |
| Lines Trim Whitespace | `multitool.lines.trim` | Trim leading and trailing whitespace on every line |
| Lines Count Lines, Words, Characters | `multitool.lines.count` |  |
| Time Unix Timestamp to ISO 8601 | `multitool.time.unixToIso` | Seconds, milliseconds or microseconds are detected automatically |
| Time Date to Unix Timestamp (seconds) | `multitool.time.isoToUnix` | Any date string JavaScript can parse, e.g. 2024-05-01T10:00:00Z |
| Time Insert Current ISO Timestamp | `multitool.time.insertIso` |  |
| Time Insert Current Unix Timestamp | `multitool.time.insertUnix` |  |
| Generate UUID v4 | `multitool.generate.uuid` | Insert a random UUID at each cursor |
<!-- tools:end -->

## Privacy

Everything runs locally inside VS Code. The text you work on is never sent anywhere. JWT decoding does **not**
verify signatures.

### Telemetry

To find bugs and see which tools are used, Dev Multitool sends anonymous telemetry to
[PostHog](https://posthog.com). It follows VS Code's **`telemetry.telemetryLevel`** setting: set it to `off`
to send nothing, or to `error` to send only error reports.

What is sent, per tool run:

- the tool id (e.g. `json.format`, or `json.compare` for JSON Compare), how it was started (command, picker,
  repeat last, tab or Explorer right-click), the output mode,
  the number of selections, whether it ran on the whole document, how long it took, and whether it
  succeeded, failed on invalid input, or hit a bug (with the error type, e.g. `TypeError`);
- the extension version, VS Code version, editor app name and operating system;
- VS Code's anonymous machine id.

For bugs, a stack trace is sent with file names outside the extension removed.

Never sent: your text or selections, error messages (they can quote your text), file names, paths,
workspace names or IP-based location.

## Contributing

New tools are a single function. See `CONTRIBUTING.md` in the source repository.

## License

MIT
