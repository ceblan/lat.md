import { existsSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

function findTemplatesDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = join(dir, 'templates');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('templates directory not found');
    dir = parent;
  }
}

export async function initCmd(targetDir?: string): Promise<void> {
  const root = resolve(targetDir ?? process.cwd());
  const latDir = join(root, 'lat.md');

  if (existsSync(latDir)) {
    console.log(chalk.yellow('lat.md/ already exists — nothing to do'));
    return;
  }

  const templateDir = join(findTemplatesDir(), 'init');
  mkdirSync(latDir, { recursive: true });
  cpSync(templateDir, latDir, { recursive: true });

  console.log(chalk.green('Created lat.md/ directory'));
}
