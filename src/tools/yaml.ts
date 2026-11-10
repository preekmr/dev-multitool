import { parseAllDocuments } from 'yaml';
import { defineTool, ToolError } from '../core/tool';
import { indentString } from '../core/util';

export const yamlTools = [
  defineTool({
    id: 'yaml.toJson',
    category: 'YAML',
    title: 'to JSON',
    description: 'Convert YAML to JSON (multi-document YAML becomes an array)',
    run: (input, ctx) => {
      const docs = parseAllDocuments(input);
      const values = docs.map((doc) => {
        if (doc.errors.length > 0) throw new ToolError(`Invalid YAML: ${doc.errors[0].message}`);
        return doc.toJS();
      });
      const value = values.length === 1 ? values[0] : values;
      return JSON.stringify(value, null, indentString(ctx));
    },
  }),
];
