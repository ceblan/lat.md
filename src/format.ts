import { relative } from 'node:path';
import chalk from 'chalk';
import type { Section } from './lattice.js';

export function formatSectionPreview(
  section: Section,
  latticeDir: string,
): string {
  const relPath =
    relative(process.cwd(), latticeDir + '/' + section.file + '.md');
  const idParts = section.id.split('#');
  const coloredId =
    idParts.length === 1
      ? chalk.bold.white(idParts[0])
      : chalk.dim(idParts.slice(0, -1).join('#') + '#') +
        chalk.bold.white(idParts[idParts.length - 1]);

  const lines: string[] = [
    `  ${coloredId}`,
    `  ${chalk.dim(relPath + ':' + section.startLine + '-' + section.endLine)}`,
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
