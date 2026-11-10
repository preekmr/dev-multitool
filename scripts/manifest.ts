/**
 * Builds the `contributes` section of package.json from the tool registry.
 * Shared by scripts/sync-manifest.ts and the tests.
 */
import { commandId, displayTitle, type Tool } from '../src/core/tool';

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
  ];

  const submenus = [
    { id: 'multitool.context', label: 'Multitool' },
    ...categories.map((c) => ({ id: `multitool.context.${slug(c)}`, label: c })),
  ];

  const menus: Record<string, unknown[]> = {
    commandPalette: tools.map((t) => ({ command: commandId(t), when: 'editorIsOpen' })),
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
    },
  };

  return { commands, submenus, menus, keybindings, configuration };
}

export function buildToolTable(tools: readonly Tool[]): string {
  const rows = tools.map(
    (t) => `| ${displayTitle(t)} | \`${commandId(t)}\` | ${(t.description ?? '').replace(/\|/g, '\\|')} |`,
  );
  return ['| Tool | Command ID (for keybindings) | Description |', '| --- | --- | --- |', ...rows].join('\n');
}
