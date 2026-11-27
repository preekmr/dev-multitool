/**
 * The contract for editor features: commands that need the cursor or editor UI, so they can't be a
 * text-in/text-out `Tool`. A feature lists its manifest contributions here; `npm run sync` writes them
 * to package.json and `npm run check:manifest` checks them, just like tools.
 *
 * No `vscode` import: the manifest generator loads this.
 */
import type { KeybindingSpec } from '../core/tool';

export interface FeatureCommand {
  /** Full command id, e.g. `multitool.json.copyPath`. Never change it after release. */
  command: string;
  /** Read after the category, e.g. "Copy Path at Cursor" → palette "Multitool: JSON Copy Path at Cursor". */
  title: string;
  /** One line for the Multitool picker. */
  description?: string;
  /** Command Palette `when` clause. Default: 'editorIsOpen'. */
  when?: string;
  /** Also list it in the category's submenu of the editor right-click menu. */
  contextMenu?: boolean;
  /** Also list it in "Multitool: Run Tool…". */
  picker?: boolean;
  keybinding?: KeybindingSpec & { when?: string };
}

/** A `contributes.configuration` property schema. */
export type SettingSchema = Record<string, unknown> & { default: unknown };

export interface Feature {
  /** Short id, e.g. `jsonPath`. Used for menu group names. */
  id: string;
  /** Category the commands belong to, e.g. "JSON". Matches a tool category to share its submenu. */
  category: string;
  commands: readonly FeatureCommand[];
  /** Settings by full key, e.g. `multitool.json.pathStyle`. */
  settings?: Readonly<Record<string, SettingSchema>>;
}

export function defineFeature(feature: Feature): Feature {
  return feature;
}

/** Palette title, e.g. "JSON Copy Path at Cursor". */
export function featureTitle(feature: Pick<Feature, 'category'>, command: Pick<FeatureCommand, 'title'>): string {
  return `${feature.category} ${command.title}`;
}

const COMMAND_PATTERN = /^multitool\.[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
const SETTING_PATTERN = /^multitool\.[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

/** Problems with the feature registry, given every other command id already in use. */
export function validateFeatures(features: readonly Feature[], takenCommands: Iterable<string>): string[] {
  const problems: string[] = [];
  const seen = new Set(takenCommands);
  const ids = new Set<string>();
  const settings = new Set<string>();
  for (const f of features) {
    if (ids.has(f.id)) problems.push(`feature "${f.id}": duplicate id.`);
    ids.add(f.id);
    if (!f.category.trim()) problems.push(`feature "${f.id}": category is empty.`);
    for (const c of f.commands) {
      if (!COMMAND_PATTERN.test(c.command)) problems.push(`"${c.command}": command id must look like "multitool.area.action".`);
      if (seen.has(c.command)) problems.push(`"${c.command}": command id is already used.`);
      seen.add(c.command);
      if (!c.title.trim()) problems.push(`"${c.command}": title is empty.`);
    }
    for (const key of Object.keys(f.settings ?? {})) {
      if (!SETTING_PATTERN.test(key)) problems.push(`setting "${key}" must start with "multitool.".`);
      if (settings.has(key)) problems.push(`setting "${key}": defined twice.`);
      settings.add(key);
    }
  }
  return problems;
}
