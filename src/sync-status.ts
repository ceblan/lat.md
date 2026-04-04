import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { SOURCE_EXTENSIONS } from './source-parser.js';

export type DiffAnalysis = {
  codeLines: number;
  latMdLines: number;
  usesNestedLatRepo: boolean;
};

function runGitNumstat(cwd: string): string {
  try {
    return execSync('git diff HEAD --numstat', {
      cwd,
      encoding: 'utf-8',
    });
  } catch {
    return '';
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function parseNumstat(
  output: string,
  onRow: (changed: number, file: string) => void,
): void {
  for (const line of output.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parseInt(parts[0], 10) || 0;
    const removed = parseInt(parts[1], 10) || 0;
    const file = normalizePath(parts[2]);
    onRow(added + removed, file);
  }
}

/**
 * Analyze unstaged/staged changes against HEAD for hook sync checks.
 *
 * Default mode reads `git diff` from the project root and counts:
 * - codeLines: source files outside lat.md/
 * - latMdLines: files inside lat.md/
 *
 * If lat.md/ contains its own `.git` (nested repo/submodule), latMdLines is
 * computed from that nested repo's own `git diff HEAD --numstat` instead.
 */
// @lat: [[cli#hook#Stop]]
export function analyzeDiff(projectRoot: string, latDir: string): DiffAnalysis {
  const output = runGitNumstat(projectRoot);

  let codeLines = 0;
  let latMdLinesInMainRepo = 0;
  const latPrefix =
    normalizePath(relative(projectRoot, latDir)).replace(/\/+$/, '') + '/';

  parseNumstat(output, (changed, file) => {
    if (file.startsWith(latPrefix)) {
      latMdLinesInMainRepo += changed;
      return;
    }

    if (SOURCE_EXTENSIONS.has(extname(file))) {
      codeLines += changed;
    }
  });

  const hasNestedGitRepo = existsSync(join(latDir, '.git'));
  if (!hasNestedGitRepo) {
    return {
      codeLines,
      latMdLines: latMdLinesInMainRepo,
      usesNestedLatRepo: false,
    };
  }

  let latMdLinesInNestedRepo = 0;
  parseNumstat(runGitNumstat(latDir), (changed) => {
    latMdLinesInNestedRepo += changed;
  });

  return {
    codeLines,
    latMdLines: latMdLinesInNestedRepo,
    usesNestedLatRepo: true,
  };
}
