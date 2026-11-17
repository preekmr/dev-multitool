/**
 * Command ids and titles for JSON Compare. No `vscode` import: the manifest generator uses this.
 */
export const COMPARE = {
  compareWith: 'multitool.jsonCompare.compareWith',
  compareSelected: 'multitool.jsonCompare.compareSelected',
  copyMarkdown: 'multitool.jsonDiff.copyMarkdown',
  clear: 'multitool.jsonDiff.clear',
  reveal: 'multitool.jsonDiff.reveal',
} as const;

export const COMPARE_VIEW_CONTAINER = 'multitool-json-diff';
export const COMPARE_VIEW = 'multitool.jsonDiff';
export const HAS_RESULT_CONTEXT = 'multitool.jsonDiff.hasResult';

export const COMPARE_COMMANDS = [
  {
    command: COMPARE.compareWith,
    title: 'JSON Compare with…',
    category: 'Multitool',
    description: 'Compare this JSON file or tab with another tab or file, ignoring key order and formatting',
  },
  {
    command: COMPARE.compareSelected,
    title: 'JSON Compare Selected Files',
    category: 'Multitool',
    description: 'Compare the two JSON files selected in the Explorer',
  },
  { command: COMPARE.copyMarkdown, title: 'Copy JSON Diff as Markdown', category: 'Multitool', icon: '$(copy)' },
  { command: COMPARE.clear, title: 'Clear JSON Diff', category: 'Multitool', icon: '$(clear-all)' },
  { command: COMPARE.reveal, title: 'Show Change in Diff', category: 'Multitool' },
];
