# Changelog

All notable changes to Dev Multitool are listed here.

## Unreleased

- Anonymous usage and error telemetry (PostHog). Follows VS Code's `telemetry.telemetryLevel` setting;
  never sends your text, file names or paths. See "Telemetry" in the README.
- URL Encode Component shows a clear error instead of "URI malformed" for text with an invalid Unicode character.

## 0.1.2 — 2026-11-10

- README: fix the broken icon image and links on the Marketplace page.

## 0.1.1 — 2026-11-10

- README: install links for the VS Code Marketplace, Open VSX and GitHub Releases.
- Changelog shows release dates.

## 0.1.0 — 2026-11-10

First release.

- JSON, XML, YAML, Base64, URL, JWT, hash, HTML entity, hex, case, line, time and UUID tools (47 in total).
- Command Palette commands for every tool, `Multitool: Run Tool…` picker, right-click submenu, repeat last tool.
- JSON Format, Minify, Sort Keys, Validate and to YAML work on a selected array element: a trailing comma and surrounding whitespace are kept, and formatted output keeps the selection's indentation.
- Clear errors for invalid input, with line and column for JSON and XML.
