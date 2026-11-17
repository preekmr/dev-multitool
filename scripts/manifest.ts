/**
 * Builds the `contributes` section of package.json from the tool registry.
 * Shared by scripts/sync-manifest.ts and the tests.
 */
import { commandId, displayTitle, type Tool } from '../src/core/tool';
import {
  COMPARE,
  COMPARE_COMMANDS,
  COMPARE_VIEW,
  COMPARE_VIEW_CONTAINER,
  HAS_RESULT_CONTEXT,
} from '../src/compare/commands';

const JSON_FILE_WHEN = 'resourceExtname =~ /^\\.(json|jsonc|json5|geojson|har|webmanifest)$/i';

export const META_COMMANDS = [
  { command: 'multitool.runTool', title: 'Run Tool…', category: 'Multitool' },
  { command: 'multitool.runToolToNewTab', title: 'Run Tool (Result in New Tab)…', category: 'Multitool' },
  { command: 'multitool.repeatLastTool', title: 'Repeat Last Tool', category: 'Multitool' },
];

const slug = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function buildContributes(tools: readonly Tool[]) {
  const categories = [...new Set(tools.map((t) => t.category))];

  const commands = [
    ...META_COMMANDS,
    ...tools.map((t) => ({ command: commandId(t), title: displayTitle(t), category: 'Multitool' })),
    ...COMPARE_COMMANDS.map(({ command, title, category, icon }) => ({ command, title, category, ...(icon ? { icon } : {}) })),
  ];

  const submenus = [
    { id: 'multitool.context', label: 'Multitool' },
    ...categories.map((c) => ({ id: `multitool.context.${slug(c)}`, label: c })),
  ];

  const menus: Record<string, unknown[]> = {
    commandPalette: [
      ...tools.map((t) => ({ command: commandId(t), when: 'editorIsOpen' })),
      { command: COMPARE.compareWith, when: 'editorIsOpen' },
      { command: COMPARE.compareSelected, when: 'false' },
      { command: COMPARE.reveal, when: 'false' },
      { command: COMPARE.copyMarkdown, when: HAS_RESULT_CONTEXT },
      { command: COMPARE.clear, when: HAS_RESULT_CONTEXT },
    ],
    // Explorer: select two JSON files → right-click.
    'explorer/context': [
      { command: COMPARE.compareSelected, group: '3_compare@99', when: `listDoubleSelection && !explorerResourceIsFolder && ${JSON_FILE_WHEN}` },
    ],
    // Right-click on an editor tab.
    'editor/title/context': [
      { command: COMPARE.compareWith, group: '3_compare@99', when: `resourceLangId == json || resourceLangId == jsonc || ${JSON_FILE_WHEN}` },
    ],
    'view/title': [
      { command: COMPARE.copyMarkdown, group: 'navigation@1', when: `view == ${COMPARE_VIEW} && ${HAS_RESULT_CONTEXT}` },
      { command: COMPARE.clear, group: 'navigation@2', when: `view == ${COMPARE_VIEW} && ${HAS_RESULT_CONTEXT}` },
    ],
    'editor/context': [
      { submenu: 'multitool.context', group: '1_modification@99', when: 'config.multitool.contextMenu.enabled' },
    ],
    'multitool.context': [
      { command: 'multitool.runTool', group: '0_pick@1' },
      { command: 'multitool.repeatLastTool', group: '0_pick@2' },
      ...categories.map((c, i) => ({ submenu: `multitool.context.${slug(c)}`, group: `1_tools@${i + 1}` })),
    ],
  };
  for (const c of categories) {
    menus[`multitool.context.${slug(c)}`] = tools
      .filter((t) => t.category === c)
      .map((t, i) => ({ command: commandId(t), group: `1_tools@${i + 1}` }));
  }
  // JSON Compare sits in the JSON submenu of the editor right-click menu, after the text tools.
  menus['multitool.context.json']?.push({ command: COMPARE.compareWith, group: '2_compare@1' });

  // The "JSON Diff" report lives in the bottom panel, next to Terminal / Problems.
  const viewsContainers = {
    panel: [{ id: COMPARE_VIEW_CONTAINER, title: 'JSON Diff', icon: 'images/json-diff.svg' }],
  };
  const views = { [COMPARE_VIEW_CONTAINER]: [{ id: COMPARE_VIEW, name: 'JSON Diff' }] };
  const viewsWelcome = [
    {
      view: COMPARE_VIEW,
      contents: `Compare two JSON files or tabs side by side, ignoring key order and formatting. The changes are listed here.\n[Compare with…](command:${COMPARE.compareWith})\nYou can also select two JSON files in the Explorer, right-click, and choose "Multitool: JSON Compare Selected Files".`,
    },
  ];

  const keybindings = [
    { command: 'multitool.runTool', key: 'ctrl+alt+shift+d', mac: 'cmd+alt+shift+d', when: 'editorTextFocus' },
    ...tools
      .filter((t) => t.keybinding)
      .map((t) => ({
        command: commandId(t),
        key: t.keybinding!.key,
        mac: t.keybinding!.mac ?? t.keybinding!.key,
        when: 'editorTextFocus',
      })),
  ];

  const configuration = {
    title: 'Dev Multitool',
    properties: {
      'multitool.indent': {
        type: ['string', 'number'],
        default: 'auto',
        markdownDescription:
          'Indentation for formatters: `"auto"` follows the editor (tab size / insert spaces), `"tab"` uses tabs, or a number of spaces.',
      },
      'multitool.contextMenu.enabled': {
        type: 'boolean',
        default: true,
        description: 'Show the Multitool submenu in the editor right-click menu.',
      },
      'multitool.jsonCompare.sortKeys': {
        type: 'boolean',
        default: true,
        markdownDescription:
          'JSON Compare: sort object keys on both sides, so key order never shows as a difference. Turn off to see key-order changes in the side-by-side diff.',
      },
    },
  };

  return { commands, submenus, menus, keybindings, configuration, viewsContainers, views, viewsWelcome };
}

export function buildToolTable(tools: readonly Tool[]): string {
  const rows = tools.map(
    (t) => `| ${displayTitle(t)} | \`${commandId(t)}\` | ${(t.description ?? '').replace(/\|/g, '\\|')} |`,
  );
  return ['| Tool | Command ID (for keybindings) | Description |', '| --- | --- | --- |', ...rows].join('\n');
}
