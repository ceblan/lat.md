import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findTemplatesDir } from './templates.js';

export function readAgentsTemplate(): string {
  return readFileSync(join(findTemplatesDir(), 'AGENTS.md'), 'utf-8');
}

export function readCursorRulesTemplate(): string {
  return readFileSync(join(findTemplatesDir(), 'cursor-rules.md'), 'utf-8');
}

export async function genCmd(target: string): Promise<void> {
  const normalized = target.toLowerCase();
  switch (normalized) {
    case 'agents.md':
    case 'claude.md':
      process.stdout.write(readAgentsTemplate());
      break;
    case 'cursor-rules.md':
      process.stdout.write(readCursorRulesTemplate());
      break;
    default:
      console.error(
        `Unknown target: ${target}. Supported: agents.md, claude.md, cursor-rules.md`,
      );
      process.exit(1);
  }
}
