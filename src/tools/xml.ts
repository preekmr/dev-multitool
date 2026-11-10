import { XMLValidator } from 'fast-xml-parser';
import xmlFormat from 'xml-formatter';
import { defineTool, ToolError } from '../core/tool';
import { indentString } from '../core/util';

/** Fails with line/column information unless the input is well-formed XML. */
function assertWellFormed(input: string): void {
  const result = XMLValidator.validate(input, { allowBooleanAttributes: true });
  if (result !== true) {
    const { msg, line, col } = result.err;
    throw new ToolError(`Invalid XML (line ${line}, column ${col}): ${msg}`);
  }
}

function wrap<T>(input: string, fn: () => T): T {
  assertWellFormed(input);
  try {
    return fn();
  } catch (err) {
    throw new ToolError(`Invalid XML: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const xmlTools = [
  defineTool({
    id: 'xml.format',
    category: 'XML',
    title: 'Format',
    description: 'Pretty-print XML',
    run: (input, ctx) =>
      wrap(input, () =>
        xmlFormat(input, {
          indentation: indentString(ctx),
          collapseContent: true,
          lineSeparator: ctx.eol,
        }),
      ),
  }),
  defineTool({
    id: 'xml.minify',
    category: 'XML',
    title: 'Minify',
    description: 'Remove whitespace between tags',
    run: (input) => wrap(input, () => xmlFormat.minify(input, { collapseContent: true })),
  }),
  defineTool({
    id: 'xml.validate',
    category: 'XML',
    title: 'Validate',
    description: 'Check whether the text is well-formed XML',
    output: 'message',
    run: (input) => {
      assertWellFormed(input);
      return 'well-formed XML';
    },
  }),
];
