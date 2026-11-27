/**
 * The feature registry: editor features that are not `Tool`s. Add a feature here and run
 * `npm run sync` to write its commands, menus, keybindings and settings to package.json.
 * No `vscode` import (the manifest generator loads this); each feature's vscode code lives next to it.
 */
import type { Feature } from './feature';
import { jsonPathFeature } from './json/commands';

export const features: readonly Feature[] = [jsonPathFeature];
