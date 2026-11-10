import { defineTool, ToolError } from '../core/tool';
import { indentString } from '../core/util';

export const urlTools = [
  defineTool({
    id: 'url.encode',
    category: 'URL',
    title: 'Encode Component',
    description: 'Percent-encode text for use in a query parameter or path segment',
    run: (input) => encodeURIComponent(input),
  }),
  defineTool({
    id: 'url.decode',
    category: 'URL',
    title: 'Decode',
    description: 'Decode percent-encoded text (treats + as space)',
    run: (input) => {
      try {
        return decodeURIComponent(input.replace(/\+/g, ' '));
      } catch {
        throw new ToolError('Input contains a malformed percent-encoding sequence.');
      }
    },
  }),
  defineTool({
    id: 'url.parse',
    category: 'URL',
    title: 'Parse to JSON',
    description: 'Break a URL into protocol, host, path and query parameters',
    output: 'newDocument',
    outputLanguage: 'json',
    run: (input, ctx) => {
      let url: URL;
      try {
        url = new URL(input.trim());
      } catch {
        throw new ToolError('Not an absolute URL (expected something like https://example.com/path?x=1).');
      }
      const query: Record<string, string | string[]> = {};
      for (const [key, value] of url.searchParams) {
        const existing = query[key];
        query[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
      }
      return JSON.stringify(
        {
          href: url.href,
          protocol: url.protocol.replace(/:$/, ''),
          username: url.username || undefined,
          host: url.hostname,
          port: url.port || undefined,
          path: url.pathname,
          query,
          hash: url.hash ? url.hash.slice(1) : undefined,
        },
        null,
        indentString(ctx),
      );
    },
  }),
];
