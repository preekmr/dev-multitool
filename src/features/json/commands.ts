/**
 * Command ids, titles and settings for JSON Path and array counts.
 * No `vscode` import: the manifest generator uses this.
 */
import { DEFAULT_PATH_STYLE, PATH_STYLES } from '../../core/json/path';
import { defineFeature } from '../feature';

export const JSON_PATH = {
  copyPath: 'multitool.json.copyPath',
  goToPath: 'multitool.json.goToPath',
  countArrayItems: 'multitool.json.countArrayItems',
} as const;

/** Setting key without the `multitool.` section. */
export const PATH_STYLE_SETTING = 'json.pathStyle';

export const jsonPathFeature = defineFeature({
  id: 'jsonPath',
  category: 'JSON',
  commands: [
    {
      command: JSON_PATH.copyPath,
      title: 'Copy Path at Cursor',
      description: 'Copy the path of the value at the cursor, e.g. $.users[3].name (one line per cursor)',
      contextMenu: true,
      picker: true,
    },
    {
      command: JSON_PATH.goToPath,
      title: 'Go to Path…',
      description: 'Select the value at a path like $.users[3].name',
      contextMenu: true,
      picker: true,
    },
    {
      command: JSON_PATH.countArrayItems,
      title: 'Count Array Items',
      description: 'Count the items of the array at the cursor',
      contextMenu: true,
      picker: true,
    },
  ],
  settings: {
    [`multitool.${PATH_STYLE_SETTING}`]: {
      type: 'string',
      enum: [...PATH_STYLES],
      default: DEFAULT_PATH_STYLE,
      markdownEnumDescriptions: [
        'JSONPath: `$.users[3].name`, keys that are not identifiers in quotes: `$[\'a-b\']`',
        'JSON Pointer (RFC 6901): `/users/3/name`',
        'JavaScript: `users[3].name`',
      ],
      markdownDescription:
        'How **JSON Copy Path at Cursor** and **JSON Go to Path…** write paths. **Go to Path…** reads all three styles.',
    },
  },
});
