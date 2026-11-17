import { formatPath, type PathSegment } from './diff';

/** Finds the line of a path, falling back to its nearest ancestor that exists on that side. */
export function lineForPath(lines: Map<string, number>, path: readonly PathSegment[]): number {
  for (let n = path.length; n >= 0; n--) {
    const line = lines.get(formatPath(path.slice(0, n)));
    if (line !== undefined) return line;
  }
  return 0;
}
