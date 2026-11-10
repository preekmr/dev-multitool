import { tools } from '../src/tools';
import { DEFAULT_CONTEXT, type ToolContext } from '../src/core/tool';

export function getTool(id: string) {
  const tool = tools.find((t) => t.id === id);
  if (!tool) throw new Error(`No tool with id ${id}`);
  return tool;
}

export async function run(id: string, input: string, ctx: Partial<ToolContext> = {}): Promise<string> {
  return getTool(id).run(input, { ...DEFAULT_CONTEXT, ...ctx });
}
