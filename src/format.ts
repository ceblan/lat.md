import { relative } from 'node:path';
import type { Section } from './lattice.js';

export function formatSectionPreview(
  section: Section,
  latticeDir: string,
): string {
  const relPath = relative(process.cwd(), latticeDir + '/' + section.file + '.md');
  const lines: string[] = [
    `  ${section.id}`,
    `  ${relPath}:${section.startLine}-${section.endLine}`,
  ];

  if (section.body) {
    const truncated =
      section.body.length > 200
        ? section.body.slice(0, 200) + '...'
        : section.body;
    lines.push('');
    lines.push(`    ${truncated}`);
  }

  return lines.join('\n');
}
