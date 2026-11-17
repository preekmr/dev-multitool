import * as vscode from 'vscode';

export const SCHEME = 'multitool-json';
const MAX_DOCUMENTS = 40;

/**
 * Serves the read-only, normalized copies shown in the diff editor.
 * URIs look like multitool-json:/<n>/<file name>.json so the diff tab shows the file names
 * and VS Code picks JSON highlighting from the extension.
 */
export class NormalizedContentProvider implements vscode.TextDocumentContentProvider {
  private readonly docs = new Map<string, string>();
  private counter = 0;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.docs.get(uri.toString()) ?? '';
  }

  add(name: string, text: string): vscode.Uri {
    const safe = name.replace(/[\\/]/g, '_') || 'document';
    const file = /\.jsonc?$/i.test(safe) ? safe : `${safe}.json`;
    const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${++this.counter}/${file}` });
    this.docs.set(uri.toString(), text);
    // Keep memory bounded: forget the oldest copies.
    while (this.docs.size > MAX_DOCUMENTS) {
      const oldest = this.docs.keys().next().value as string;
      this.docs.delete(oldest);
    }
    return uri;
  }
}
