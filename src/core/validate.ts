import type { Tool } from './tool';

const ID_PATTERN = /^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/;

/** Returns a list of problems with the registry (empty when everything is fine). */
export function validateTools(tools: readonly Tool[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!ID_PATTERN.test(tool.id)) problems.push(`"${tool.id}": id must look like "category.action" (camelCase).`);
    if (seen.has(tool.id)) problems.push(`"${tool.id}": duplicate id.`);
    seen.add(tool.id);
    if (!tool.title.trim()) problems.push(`"${tool.id}": title is empty.`);
    if (!tool.category.trim()) problems.push(`"${tool.id}": category is empty.`);
  }
  return problems;
}
