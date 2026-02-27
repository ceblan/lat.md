import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findLatticeDir,
  listLatticeFiles,
  parseSections,
  loadAllSections,
  findSections,
  extractRefs,
} from '../src/lattice.js';
import { formatSectionPreview } from '../src/format.js';

const fixtureDir = join(import.meta.dirname, '.lattice');

describe('findLatticeDir', () => {
  it('finds .lattice in the given directory', () => {
    expect(findLatticeDir(import.meta.dirname)).toBe(fixtureDir);
  });

  it('finds .lattice in a parent directory', () => {
    // tests/.lattice exists, so searching from a child should find it
    // Create a synthetic deep path under tests/
    expect(findLatticeDir(fixtureDir)).toBe(fixtureDir);
  });

  it('returns null when no .lattice exists', () => {
    expect(findLatticeDir('/')).toBeNull();
  });
});

describe('listLatticeFiles', () => {
  it('lists .md files sorted alphabetically', async () => {
    const files = await listLatticeFiles(fixtureDir);
    expect(files).toEqual([
      join(fixtureDir, 'dev-process.md'),
      join(fixtureDir, 'notes.md'),
    ]);
  });
});

describe('parseSections', () => {
  it('builds a section tree from nested headings', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);

    expect(sections).toHaveLength(1);
    const top = sections[0];
    expect(top.id).toBe('Dev Process');
    expect(top.heading).toBe('Dev Process');
    expect(top.depth).toBe(1);
    expect(top.file).toBe('dev-process');
    expect(top.children).toHaveLength(2);

    const testing = top.children[0];
    expect(testing.id).toBe('Dev Process#Testing');
    expect(testing.children).toHaveLength(1);
    expect(testing.children[0].id).toBe('Dev Process#Testing#Running Tests');

    const formatting = top.children[1];
    expect(formatting.id).toBe('Dev Process#Formatting');
    expect(formatting.children).toHaveLength(0);
  });

  it('populates startLine, endLine, and body', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);

    const top = sections[0];
    expect(top.startLine).toBe(1);
    expect(top.body).toBe('');

    const testing = top.children[0];
    expect(testing.startLine).toBe(3);
    expect(testing.body).toBe('');

    const running = testing.children[0];
    expect(running.startLine).toBe(5);
    expect(running.endLine).toBe(8);
    expect(running.body).toBe('Run tests with vitest.');

    const formatting = top.children[1];
    expect(formatting.startLine).toBe(9);
    expect(formatting.endLine).toBe(11);
    expect(formatting.body).toBe('Prettier all the things.');
  });

  it('handles multiple top-level headings', () => {
    const sections = parseSections('multi.md', '# First\n\n# Second\n');
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe('First');
    expect(sections[1].id).toBe('Second');
  });

  it('uses file stem without .md extension', () => {
    const sections = parseSections('/path/to/notes.md', '# Hello');
    expect(sections[0].file).toBe('notes');
  });
});

describe('extractRefs', () => {
  it('extracts wiki link references from a file', () => {
    const filePath = join(fixtureDir, 'notes.md');
    const content = readFileSync(filePath, 'utf-8');
    const refs = extractRefs(filePath, content);

    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe('Dev Process#Testing');
    expect(refs[0].fromSection).toBe('Notes#Second Topic');
    expect(refs[0].file).toBe('notes');
    expect(refs[0].line).toBe(9);
  });

  it('returns empty array for file with no wiki links', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const refs = extractRefs(filePath, content);

    expect(refs).toHaveLength(0);
  });
});

describe('formatSectionPreview', () => {
  it('formats a section with body text', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);
    const running = sections[0].children[0].children[0];

    const output = formatSectionPreview(running, fixtureDir);
    const lines = output.split('\n');

    expect(lines[0]).toBe('  Dev Process#Testing#Running Tests');
    expect(lines[1]).toContain('dev-process.md:5-8');
    expect(lines[2]).toBe('');
    expect(lines[3]).toBe('    Run tests with vitest.');
  });

  it('formats a section without body text', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);
    const testing = sections[0].children[0];

    const output = formatSectionPreview(testing, fixtureDir);
    const lines = output.split('\n');

    expect(lines[0]).toBe('  Dev Process#Testing');
    expect(lines[1]).toContain('dev-process.md:3-4');
    expect(lines).toHaveLength(2);
  });
});

describe('end-to-end locate', () => {
  it('finds sections by exact id match (case-insensitive)', async () => {
    const sections = await loadAllSections(fixtureDir);
    const matches = findSections(
      sections,
      'Dev Process#Testing#Running Tests',
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('Dev Process#Testing#Running Tests');
    expect(matches[0].file).toBe('dev-process');
  });

  it('returns empty for non-matching query', async () => {
    const sections = await loadAllSections(fixtureDir);
    const matches = findSections(sections, 'Nonexistent');

    expect(matches).toHaveLength(0);
  });
});

describe('end-to-end refs', () => {
  it('finds sections that reference a given section via wiki links', async () => {
    const { readFile } = await import('node:fs/promises');
    const files = [
      join(fixtureDir, 'dev-process.md'),
      join(fixtureDir, 'notes.md'),
    ];

    const allSections = [];
    const allRefs = [];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      allSections.push(...parseSections(file, content));
      allRefs.push(...extractRefs(file, content));
    }

    // Find refs targeting "Dev Process#Testing"
    const q = 'dev process#testing';
    const matchingFromSections = new Set(
      allRefs
        .filter((r) => r.target.toLowerCase() === q)
        .map((r) => r.fromSection.toLowerCase()),
    );

    expect(matchingFromSections.size).toBe(1);
    expect(matchingFromSections.has('notes#second topic')).toBe(true);
  });
});
