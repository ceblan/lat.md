# Integrating lat.md Documentation Detection into Daily Session Journal

Research findings on detecting and linking modified lat.md sections in session journal entries.

This document provides technical approaches and code patterns for automatically detecting which lat.md sections were modified during a coding session and linking them in journal entries stored in `lat.md/journals/YYYY-MM-DD.md`.

**Research Date:** April 10, 2026  
**Focus:** Integration of git diff analysis with Pi extension lifecycle hooks to capture lat.md changes during sessions

## Research Overview

Technical investigation of approaches for capturing lat.md documentation changes within session lifecycle.

This investigation examines how to leverage existing git diff mechanics, section parsing, and Pi extension hooks to automatically link modified lat.md sections in daily journal entries. The research identifies proven patterns from the lat.md codebase and proposes a phased implementation strategy.

## 1. Git Diff Mechanics for Detecting Modified Files

The existing lat.md codebase already implements robust diff analysis for sync checks. This section documents the proven patterns.

### Current Implementation: `analyzeDiff()`

Existing diff analysis foundation from the codebase.

Located in [`src/sync-status.ts`](https://github.com/mariozechner/lat.md/blob/main/src/sync-status.ts#L52-L90), the `analyzeDiff()` function provides the foundation for detecting file changes:

```typescript
// Core diff analysis pattern from sync-status.ts
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

export function analyzeDiff(projectRoot: string, latDir: string): DiffAnalysis {
  const output = runGitNumstat(projectRoot);
  let codeLines = 0;
  let latMdLines = 0;
  
  const latPrefix = normalizePath(relative(projectRoot, latDir))
    .replace(/\/+$/, '') + '/';

  parseNumstat(output, (changed, file) => {
    if (file.startsWith(latPrefix)) {
      latMdLines += changed;
      return;
    }
    if (SOURCE_EXTENSIONS.has(extname(file))) {
      codeLines += changed;
    }
  });
  
  return { codeLines, latMdLines, usesNestedLatRepo: false };
}
```

**Key Features:**
- Uses `git diff HEAD --numstat` to get staged and unstaged changes
- Returns added + removed line counts per file
- Handles nested lat.md repos (separate `.git` directories)
- Normalizes paths for cross-platform compatibility

### Extracting Modified lat.md Files

Pattern to extend diff analysis for identifying specific changed files.

To identify which specific lat.md files changed, extend the diff analysis:

```typescript
// Pattern for extracting modified lat.md files
interface LatMdFileChange {
  file: string;        // Relative path: "auth.md", "guides/setup.md"
  linesChanged: number;
  added: number;
  removed: number;
}

function getModifiedLatFiles(
  projectRoot: string, 
  latDir: string
): LatMdFileChange[] {
  const output = runGitNumstat(projectRoot);
  const latPrefix = normalizePath(relative(projectRoot, latDir))
    .replace(/\/+$/, '') + '/';
  const modified: LatMdFileChange[] = [];

  parseNumstat(output, (changed, file) => {
    if (!file.startsWith(latPrefix)) return;
    if (!file.endsWith('.md')) return;
    
    // Extract file path relative to lat.md/
    const latRelative = file.slice(latPrefix.length);
    modified.push({
      file: latRelative,
      linesChanged: changed,
      added: parseInt(parts[0], 10) || 0,
      removed: parseInt(parts[1], 10) || 0,
    });
  });

  return modified;
}
```

### Session State Tracking

Mechanisms to capture git state at session boundaries.

Capture git state at session boundaries:

```typescript
// Store baseline on session_start
interface SessionBaseline {
  timestamp: number;
  gitHead: string;           // Current HEAD commit SHA
  modifiedFiles: Set<string>; // Files modified at session start
}

function captureSessionBaseline(projectRoot: string): SessionBaseline {
  const gitHead = execSync('git rev-parse HEAD', {
    cwd: projectRoot,
    encoding: 'utf-8'
  }).trim();

  // Get list of files with uncommitted changes
  const output = execSync('git diff --name-only', {
    cwd: projectRoot,
    encoding: 'utf-8'
  });
  
  const modifiedFiles = new Set(output.split('\n').filter(Boolean));

  return {
    timestamp: Date.now(),
    gitHead,
    modifiedFiles,
  };
}

// On session_shutdown, compute delta
function computeLatMdChanges(
  projectRoot: string,
  latDir: string,
  baseline: SessionBaseline
): LatMdFileChange[] {
  // Compare HEAD to baseline
  const currentChanges = getModifiedLatFiles(projectRoot, latDir);
  
  // Filter for changes that occurred after baseline was captured
  return currentChanges.filter(change => {
    // Only include if file was modified after session start
    return true; // Additional filtering logic as needed
  });
}
```

## 2. Section Identification and Wiki Link Formatting

Techniques for extracting section metadata and formatting wiki links.

### Parsing Markdown Headings

How lat.md parser extracts section structure from markdown files.

The lat.md parser already extracts section information. The `parseSections()` function in [`src/lattice.ts`](https://github.com/mariozechner/lat.md/blob/main/src/lattice.ts#L75-L150) demonstrates the pattern:

```typescript
// Section parsing pattern from lattice.ts
export type Section = {
  id: string;           // e.g., "auth#Authentication#Login Flow"
  heading: string;      // e.g., "Login Flow"
  depth: number;        // 1-6 (heading level)
  file: string;         // e.g., "auth" (from auth.md)
  filePath: string;     // e.g., "lat.md/auth.md"
  children: Section[];
  startLine: number;
  endLine: number;
  firstParagraph: string;
};

// Example from parsing auth.md:
// # Authentication       → Section(id="auth#Authentication", depth=1)
// ## Login              → Section(id="auth#Authentication#Login", depth=2)
// ### Handle Expired    → Section(id="auth#Authentication#Login#Handle Expired", depth=3)
```

### Extracting Modified Sections from Changed Files

Strategy to detect which sections in modified files were actually changed.

Strategy: Parse changed files, identify which sections were actually modified:

```typescript
// Detect which sections in modified files actually changed
interface ModifiedSection {
  fileId: string;        // "auth" from auth.md
  filePath: string;      // "lat.md/auth.md"
  sectionId: string;     // "auth#Authentication#Login"
  heading: string;       // "Login"
  depth: number;
  lineRange: [number, number]; // [startLine, endLine]
}

async function getModifiedSections(
  projectRoot: string,
  latDir: string,
  modifiedFiles: LatMdFileChange[]
): Promise<ModifiedSection[]> {
  const projectLatDir = latDir;
  const modified: ModifiedSection[] = [];

  for (const fileChange of modifiedFiles) {
    const filePath = join(projectLatDir, fileChange.file);
    
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content, projectRoot);
    
    // Get git diff for this specific file to see which lines changed
    const diff = getDiffForFile(projectRoot, fileChange.file);
    const changedLineNumbers = extractChangedLines(diff);

    // Match changed lines to sections
    const modifiedSections = findSectionsInLineRange(
      sections, 
      changedLineNumbers
    );

    modified.push(...modifiedSections);
  }

  return modified;
}

// Extract line numbers that were added or modified
function extractChangedLines(diff: string): Set<number> {
  const lines = new Set<number>();
  let currentLine = 0;

  for (const line of diff.split('\n')) {
    // Parse unified diff format: @@ -start,count +start,count @@
    const match = line.match(/@@ .+\+(\d+)/);
    if (match) {
      currentLine = parseInt(match[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.add(currentLine);
      currentLine++;
    } else if (!line.startsWith('-')) {
      currentLine++;
    }
  }

  return lines;
}
```

### Wiki Link Formatting

How to format section links per lat.md conventions.

Wiki links follow the lat.md convention described in [[markdown#Wiki Links]]:

```typescript
// Format wiki links for journal entries
interface JournalLink {
  text: string;        // Display text
  target: string;      // Wiki link target
  type: 'file' | 'section'; // Link type
}

function formatWikiLink(section: ModifiedSection): JournalLink {
  const fileId = section.fileId;
  const sectionId = section.sectionId;

  // Format: [[lat.md/filename#Section#Subsection]]
  return {
    text: section.heading,
    target: `lat.md/${fileId}#${sectionId.split('#').slice(1).join('#')}`,
    type: 'section',
  };
}

// Example outputs:
// [[lat.md/auth#Authentication]]
// [[lat.md/auth#Authentication#Login Flow]]
// [[lat.md/guides/setup#Installation#Node.js Setup]]

// Render in markdown
function renderJournalLinks(links: JournalLink[]): string {
  return links.map(link => `- [[${link.target}]]`).join('\n');
}
```

**Wiki Link Resolution Rules** (from [[markdown#Wiki Links]]):
- Full path required: `[[lat.md/path/to/file#Heading]]`
- Short path if unique: `[[file#Heading]]` (when filename is unique)
- File-only link: `[[lat.md/auth.md]]`
- Section hierarchy in link: `[[lat.md/auth#Authentication#Login]]` (no intermediate sections can be skipped)

### Ambiguous Section Names

How to handle cases with multiple sections having the same heading.

Handle cases where multiple sections have the same heading:

```typescript
function resolveAmbiguousSections(
  section: ModifiedSection
): string {
  // If section hierarchy is ambiguous, qualify with parent sections
  // Example: If multiple files have "Configuration" heading:
  // - Use: [[lat.md/auth#Configuration]]
  // - Use: [[lat.md/db#Configuration]]
  
  // Short form only when unambiguous
  const shortForm = section.heading;
  const fullForm = `lat.md/${section.fileId}#${shortForm}`;
  
  return fullForm; // Always use full form to be safe
}
```

## 3. Session Lifecycle Integration Points

Integration with Pi extension lifecycle hooks provides clean attachment points for capturing changes.

### Pi Lifecycle Hooks for Session Journaling

Available hooks and their application to session journaling.

From [[journal-research#Available Lifecycle Hooks]]:

| Hook | Timing | Captures | Recommended Use |
|------|--------|----------|-----------------|
| `session_start` | Session begins | Session ID, reason | Store git HEAD baseline |
| `agent_start` | Agent starts | None | Start timer for session |
| `agent_end` | Agent finishes | Messages, context | Compute changes since baseline |
| `session_shutdown` | Before exit | None | Write journal, finalize |

### Implementation Pattern

Pseudocode for integrating journal detection into Pi extension.

```typescript
// In Pi extension (~/.pi/extensions/lat.ts)

interface SessionContext {
  baseline?: SessionBaseline;
  startTime?: number;
  entries: JournalEntry[];
}

const sessionContexts = new Map<string, SessionContext>();

export default function (pi: ExtensionAPI) {
  // Capture baseline at session start
  pi.on('session_start', async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile() || 'current';
    const baseline = captureSessionBaseline(projectRoot);
    
    sessionContexts.set(sessionId, {
      baseline,
      startTime: Date.now(),
      entries: [],
    });
  });

  // Detect changes at each agent completion
  pi.on('agent_end', async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile() || 'current';
    const session = sessionContexts.get(sessionId);
    
    if (!session?.baseline) return;

    // Compute modified lat.md files
    const modifiedLatFiles = getModifiedLatFiles(projectRoot, latDir);
    const modifiedSections = await getModifiedSections(
      projectRoot,
      latDir,
      modifiedLatFiles
    );

    // Append to session tracking
    if (modifiedSections.length > 0) {
      session.entries.push({
        timestamp: Date.now(),
        agentTurn: event.turnNumber,
        modifiedSections,
      });
    }
  });

  // Write journal on session shutdown
  pi.on('session_shutdown', async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile() || 'current';
    const session = sessionContexts.get(sessionId);
    
    if (!session || session.entries.length === 0) return;

    // Write journal entry with links to modified sections
    await writeJournalEntry(session, projectRoot, latDir);
    
    sessionContexts.delete(sessionId);
  });
}
```

### Session Data Access

Available data access patterns from extension handlers.

From [[pi-integration#Runtime Workflow#After task completion ()]]:

```typescript
// Available in all event handlers via ctx parameter
ctx.sessionManager.getEntries()      // All session entries
ctx.sessionManager.getBranch()       // Current conversation path
ctx.sessionManager.getSessionFile()  // Session file path
ctx.sessionManager.getLeafId()       // Current leaf entry ID

// Message structure from agent_end event
interface AgentEndEvent {
  messages: AgentMessage[];  // All messages from this agent turn
}

interface AgentMessage {
  role: 'user' | 'assistant' | 'toolResult';
  content: ContentBlock[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface ContentBlock {
  type: 'text' | 'toolCall' | 'toolResult' | 'image';
  // ... type-specific fields
}
```

## 4. Existing Patterns: Hook and Diff Analysis

The existing lat.md hook system provides proven patterns that can be adapted for journal integration.

### Hook Implementation Pattern

Proven patterns from existing stop hook implementation.

From [[cli#hook#cursor stop]]:

The hook system already uses:
1. **`lat check`** to validate all links and code refs
2. **Diff analysis** to detect code vs lat.md changes
3. **Ratio-based flagging** when `latMdLines < codeLines * 5%`
4. **Follow-up messages** to guide users

```typescript
// Existing stop-check logic (from pi-integration.md)
// After task completion:
// 1. Run `lat check` - validate links and code refs
// 2. Analyze git diff - compare codeLines vs latMdLines
// 3. Flag work when latMdLines < codeLines * 5%
// 4. Send visible follow-up message if action required

// This pattern can be adapted for:
// - Detecting modified sections
// - Filtering only lat.md changes
// - Generating journal links automatically
```

### Stop Check Decision Logic

Adaptation patterns from sync policy implementation.

From [[src/sync-policy.ts#formatStopReason]]:

```typescript
// Existing decision policy patterns:
export function buildStopStatus(diffAnalysis: DiffAnalysis): StopStatus {
  const needsSync = diffAnalysis.codeLines > 0 && 
                    diffAnalysis.latMdLines === 0;
  
  const latMdLinesBelow5Percent = 
    diffAnalysis.latMdLines < diffAnalysis.codeLines * 0.05;

  return {
    needsSync: needsSync && latMdLinesBelow5Percent,
    // ... more logic
  };
}

// For journal integration, adapt to:
// - Include ALL lat.md changes (not just when code > lat)
// - Filter only modified sections
// - Generate link list for journal
```

## 5. Implementation Approach for Journal Integration

Recommended phased approach combining findings from sections 1-4.

### Phase 1: Capture Modified lat.md Files

Approach for detecting changed files at session boundaries.

**Timing:** `session_start` → baseline, `agent_end` → detect, `session_shutdown` → finalize

```typescript
// Pseudocode for Phase 1
on session_start:
  baseline = {
    gitHead: getGitHead(),
    timestamp: now(),
  }

on agent_end:
  if baseline.gitHead != getCurrentGitHead():
    modifiedFiles = getModifiedLatFiles()
    sessionData.changes.push({
      agentTurn: event.turnNumber,
      files: modifiedFiles,
      timestamp: now(),
    })

on session_shutdown:
  if sessionData.changes.length > 0:
    journalEntry.addModifiedFiles(sessionData.changes)
```

### Phase 2: Extract Modified Sections

Dependency structure for section extraction phase.

**Dependency:** Requires Phase 1 (list of modified files)

```typescript
// Pseudocode for Phase 2
for each modified file in sessionData.changes:
  parse(filePath) → sections
  diff = getDiffForFile(filePath)
  changedLines = extractChangedLines(diff)
  
  for each section:
    if section.lineRange overlaps changedLines:
      sessionData.modifiedSections.push(section)
```

### Phase 3: Generate Journal Entry with Links

Dependency structure for journal generation phase.

**Dependency:** Requires Phase 1-2

```typescript
// Pseudocode for Phase 3
journalEntry = {
  date: today(),
  sessions: [
    {
      duration: computeDuration(),
      userPrompts: extractUserPrompts(messages),
      toolsUsed: extractToolNames(messages),
      modifiedSections: formatWikiLinks(sessionData.modifiedSections),
    }
  ]
}

writeJournalEntry(journalEntry)
```

### File Structure

Journal entries stored in `lat.md/journals/YYYY-MM-DD.md`:

```markdown
# Daily Journal - 2026-04-10

Session journal for April 10, 2026

## Session 1 - 09:15 AM

**Duration:** 45 minutes  
**Tools Used:** lat_search, read, bash

### Modified lat.md Sections

- [[lat.md/pi-integration#Pi Integration#Extension Development Research]]
- [[lat.md/journal-research#Session Lifecycle Integration Points]]
- [[lat.md/cli#hook#cursor stop]]

### User Prompts

1. Research how to integrate lat.md documentation detection
2. Look at existing sync-status.ts patterns
3. Write findings to journal-lat-research.md
```

## 6. Code Patterns and Examples

Practical code patterns for implementation.

### Pattern 1: Detecting Changes

Complete example for detecting modified files.

```typescript
// Complete example: Detect modified lat.md files during session
import { execSync } from 'node:child_process';
import { relative, extname, join } from 'node:path';

function getModifiedLatFilesInSession(
  projectRoot: string,
  latDir: string,
  gitHeadAtSessionStart: string
): LatMdFileChange[] {
  const latPrefix = relative(projectRoot, latDir).replace(/\/+$/, '') + '/';
  
  // Compare working directory to session start
  const diff = execSync('git diff HEAD --numstat', {
    cwd: projectRoot,
    encoding: 'utf-8',
  });

  const modified: LatMdFileChange[] = [];
  
  for (const line of diff.split('\n')) {
    const [added, removed, file] = line.split('\t');
    
    if (!file.startsWith(latPrefix) || !file.endsWith('.md')) continue;
    
    modified.push({
      file: file.slice(latPrefix.length),
      linesChanged: parseInt(added, 10) + parseInt(removed, 10),
      added: parseInt(added, 10),
      removed: parseInt(removed, 10),
    });
  }

  return modified;
}
```

### Pattern 2: Formatting Wiki Links

Example for converting sections to wiki links.

```typescript
// Convert modified sections to wiki links for journal
function createJournalSectionLinks(
  sections: ModifiedSection[]
): string {
  const uniqueSections = Array.from(
    new Map(sections.map(s => [s.sectionId, s])).values()
  );

  return uniqueSections
    .map(section => {
      const link = `lat.md/${section.fileId}#${
        section.sectionId.split('#').slice(1).join('#')
      }`;
      return `- [[${link}]]`;
    })
    .join('\n');
}
```

### Pattern 3: Session Baseline and Delta

Implementation example for tracking session changes.

```typescript
// Track changes throughout session
class SessionTracker {
  private baseline: SessionBaseline;
  private changes: JournalEntry[] = [];

  capture(projectRoot: string): void {
    this.baseline = {
      gitHead: execSync('git rev-parse HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
      }).trim(),
      timestamp: Date.now(),
    };
  }

  recordChanges(
    projectRoot: string,
    latDir: string,
    turnNumber: number
  ): void {
    const modified = getModifiedLatFilesInSession(
      projectRoot,
      latDir,
      this.baseline.gitHead
    );

    if (modified.length > 0) {
      this.changes.push({
        turn: turnNumber,
        files: modified,
        timestamp: Date.now(),
      });
    }
  }

  getChangedSections(): LatMdFileChange[] {
    return this.changes.flatMap(e => e.files);
  }
}
```

## 7. Integration Checklist

Checklist and validation points for implementation.

### Requirements

Functional requirements to implement.

- [ ] Read session baseline on `session_start`
- [ ] Capture diff on each `agent_end`
- [ ] Parse modified markdown files
- [ ] Extract section headings from modified content
- [ ] Format wiki links per lat.md conventions
- [ ] Write journal entry on `session_shutdown`
- [ ] Handle edge cases (nested repos, ambiguous sections, deleted files)

### Key Validation Points

Validation criteria for implementation.

- [ ] `lat check` validates all generated wiki links
- [ ] Section IDs match lat.md parser output format
- [ ] Wiki links follow `[[lat.md/file#Section]]` format
- [ ] Journal file is valid markdown
- [ ] No duplicate links in journal entry

### Testing Strategy

Test plan for comprehensive coverage.

- [ ] Create test lat.md files with multiple sections
- [ ] Modify specific sections and verify detection
- [ ] Verify wiki links resolve correctly
- [ ] Test with nested headings (h1, h2, h3)
- [ ] Test with ambiguous section names
- [ ] Verify journal entry format

## 8. Summary and Recommendations

Key findings and recommended implementation strategy.

### Key Findings

Summary of technical research findings.

1. **Git diff mechanics are robust**: The existing `analyzeDiff()` function provides a proven foundation. Extend it to filter for lat.md changes and extract individual files.

2. **Section parsing is available**: The `parseSections()` function extracts all section metadata needed for wiki links. Combine with line-range analysis to identify which sections actually changed.

3. **Wiki link format is standardized**: Follow the pattern `[[lat.md/file#Section#Subsection]]` exactly. The lat.md parser validates these automatically.

4. **Pi lifecycle hooks provide clean integration**: The `session_start`, `agent_end`, and `session_shutdown` hooks provide perfect attachment points for capturing session state.

5. **Existing patterns are reusable**: The hook system, diff analysis, and stop-check logic can be directly adapted for journal integration.

### Recommended Implementation

Phased approach for feature delivery.

**Start with Phase 1** (detect modified files):
- Use `git diff HEAD --numstat` at session boundaries
- Filter for files in `lat.md/` directory
- Store in Pi extension session context

**Add Phase 2** (extract sections):
- Parse modified .md files using existing `parseSections()`
- Match changed line ranges to section boundaries
- Build list of modified sections

**Complete with Phase 3** (journal entry):
- Format sections as wiki links
- Write to `lat.md/journals/YYYY-MM-DD.md`
- Validate links with `lat check`

### Integration Complexity

Effort estimates for implementation phases.

**Estimated effort:**
- Phase 1: 2-3 hours (git diff filtering, session tracking)
- Phase 2: 3-4 hours (section extraction, line-range matching)
- Phase 3: 2-3 hours (journal formatting, file I/O)
- Testing/validation: 2-3 hours

**Total: ~10-15 hours for full implementation**

## References

Technical references used in this research.

- [[src/sync-status.ts#analyzeDiff]] — Existing diff analysis implementation
- [[src/lattice.ts#parseSections]] — Section parsing and hierarchy
- [[cli#hook]] — Hook implementation patterns
- [[markdown#Wiki Links]] — Wiki link format specification
- [[pi-integration#Runtime Workflow]] — Pi extension lifecycle hooks
- [[journal-research#Available Lifecycle Hooks]] — Session hook documentation

