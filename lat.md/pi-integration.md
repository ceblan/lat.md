# Pi Integration

How lat.md integrates with the pi coding agent, from initial setup to runtime behavior.

## Overview

Pi does NOT auto-detect lat.md — you must explicitly run `lat init` in your project. This command sets up the integration by creating configuration files that pi discovers and loads automatically.

See [[cli#init#Pi]] for the technical details of what files are created during setup.

## Detection and Initialization

Pi discovers lat.md integration through two mechanisms:

### 1. Extensions (primary mechanism)

Pi automatically discovers and loads TypeScript extensions from `cwd/.pi/extensions/`. The `lat init` command creates `.pi/extensions/lat.ts`, which registers:

- Six lat tools that the agent can use directly
- Lifecycle hooks (`before_agent_start`, `agent_end`) that inject workflow guidance
- Custom message renderers for lat-related messages

### 2. AGENTS.md (shared instructions)

Pi also loads `AGENTS.md` files from:
- Project root: `cwd/AGENTS.md`
- Global config: `~/.pi/agent/AGENTS.md`
- Ancestor directories (traversing upward from cwd)

The `lat init` command creates `AGENTS.md` in the project root with general instructions for agents (shared across Claude Code, Cursor, Pi, OpenCode, Codex). This file is the same content used by all non-Claude agents.

See [[cli#init]] for the full setup wizard steps.

## Runtime Workflow

Once initialized, the `.pi/extensions/lat.ts` extension is automatically loaded by pi's extension discovery mechanism. Here's what happens during each task:

### Before each task (`before_agent_start`)

The extension injects a visible message that reminds the agent:

1. **Run `lat_search`** with one or more queries describing the user's intent — even for seemingly straightforward tasks
2. **Use `lat_section`** to read the full content of relevant matches
3. **Do not read files, write code, or run commands** until searching is complete
4. **Keep `lat.md/` in sync** — update relevant sections after code changes

The message is displayed with a collapsed preview by default, and expands to full markdown when the user presses Ctrl+O (via pi's `expandTools` keybinding).

### During task execution

The agent has six lat tools available as native pi tools:

| Tool | Purpose |
|------|---------|
| `lat_search` | Semantic search across lat.md sections using embeddings |
| `lat_section` | Show full content of a section with outgoing/incoming refs |
| `lat_locate` | Find a section by name (exact, subsection tail, or fuzzy match) |
| `lat_check` | Validate all wiki links and code refs in lat.md |
| `lat_expand` | Expand `[[refs]]` in text to resolved file locations |
| `lat_refs` | Find what references a given section |

Each tool shells out to the `lat` CLI and provides custom rendering:
- **`lat_search` and `lat_section`**: Show collapsed preview (first 4 lines) by default, expand to full markdown with Ctrl+O
- **Other tools**: Display results inline in the TUI

### After task completion (`agent_end`)

The extension runs stop checks to ensure lat.md stays synchronized with the codebase:

1. **Launches subagent process** — spawns a separate `lat check` process to run validation
2. **Shows minimal status** — displays "🔍 lat check running..." while in progress
3. **Reports results compactly** — shows "✓ lat OK" on success with collapsed details

**Subagent workflow:**
- Registers journal hooks before lat hooks so journal writes happen first in `agent_end`
- Spawns a worker subprocess at `agent_end`
- Worker runs `lat check`, auto-fixes known recurring journal link patterns, and repeats (max 6 runs)
- Main extension waits for worker completion (90s timeout) and parses worker JSON summary
- Worker reports resolved error count plus how many were reintroduced-link fixes in that cycle
- If successful, extension runs `lat hook cursor stop` to verify sync and emits compact "lat OK" output
- Falls back to inline stop-check flow if the worker cannot fully resolve errors

This behavior is shared across all agents (Cursor, Claude, Pi) via the same `lat hook cursor stop` command. See [[cli#hook]] for complete details on stop hook behavior, including handling of nested lat.md repos.

## File Structure After `lat init`

Directory structure created by `lat init` when setting up lat.md for the pi agent.

```
project/
├── lat.md/                 # Created if not exists
│   └── ...                # Your architecture docs
├── .pi/
│   ├── extensions/
│   │   └── lat.ts        # Pi extension (registers tools + hooks)
│   └── skills/
│       └── lat-md/
│           └── SKILL.md   # Teaches agent to maintain lat.md files
├── AGENTS.md               # Shared agent instructions
└── .gitignore             # Updated to ignore .pi/
```

## Role of AGENTS.md

The `AGENTS.md` file contains general instructions that all non-Claude agents read. It includes:

- What lat.md is and how to use it
- Commands reference (`lat search`, `lat locate`, etc.)
- Syntax primer (wiki links, code refs, test specs)
- Post-task checklist (update lat.md, run `lat check`)

This file uses marker-based append mode, so you can add your own custom instructions outside the `%% lat:begin %%` / `%% lat:end %%` markers. See [[cli#init#Marker-based append mode]] for details.

## Role of Skills

Pi discovers skills from `.pi/skills/` directory automatically. The `.pi/skills/lat-md/SKILL.md` file teaches the agent how to:

- Write lat.md files (section structure, leading paragraphs)
- Create wiki links between sections
- Add code refs in source code that link to lat.md sections
- Define test specs with `require-code-mention` frontmatter

When you ask the agent to "document this feature" or "update lat.md", it uses this skill to ensure proper formatting and structure.

## Differences from Other Agents

How pi's lat.md integration differs from other coding agents (Claude Code, Cursor, OpenCode, Codex).

### Claude Code
Claude Code uses agent-specific configuration files with separate hooks.

- Uses `CLAUDE.md` (agent-specific) + hooks configured in `.claude/settings.json`
- Hooks: `UserPromptSubmit` (injects context) and `Stop` (validation)

### Cursor
Cursor uses rules files plus the MCP server for lat tool access.

- Uses `.cursor/rules/lat.md` + MCP server
- Hook: stop hook in `.cursor/hooks.json`

### Pi
Pi uses extensions for full integration with custom lifecycle hooks.

- Uses `AGENTS.md` (shared) + extension in `.pi/extensions/lat.ts`
- Hooks: `before_agent_start` and `agent_end` in the extension
- Custom message rendering for lat-reminder and lat-check messages

## Troubleshooting

Common issues when using lat.md with pi and how to resolve them.

### Lat tools not available

Run `lat init` in your project directory. If already initialized, verify:
- `.pi/extensions/lat.ts` exists
- Pi is running from the project root (extension discovery is cwd-relative)

### Agent not searching lat.md

The reminder message should appear before each task. If not:
- Check that `.pi/extensions/lat.ts` exists and is valid TypeScript
- Restart pi to reload extensions

### lat check warnings at end of task

This is expected behavior when you've changed code without updating lat.md. The workflow is:
1. Update relevant sections in `lat.md/`
2. Run `lat check` to validate
3. The agent will recognize the work is done on next `agent_end` hook

## See Also

Related documentation for deeper technical details and related topics.

- [[cli#init]] — Setup wizard for all agents
- [[cli#init#Pi]] — Technical details of Pi setup
- [[cli#hook]] — Hook event handling and stop-check logic
- [[markdown]] — lat.md markdown extensions (wiki links, frontmatter)

## Extension Development Research

Research findings on Pi's extension system capabilities for implementing custom features.

### Journal Extension Research

Comprehensive analysis of Pi's extension API for implementing a daily session journal feature that stores entries in `lat.md/journals/YYYY-MM-DD.md`.

Pi's extension system provides excellent support for session journaling through:

**Lifecycle Hooks:** Complete coverage of session events (`session_start`, `session_shutdown`, `agent_start`, `agent_end`) and message events (`message_start`, `message_end`, `tool_execution_*`) for capturing all user interactions and agent responses.

**Session Data Access:** Rich session data via `ctx.sessionManager.getBranch()` providing access to all conversation messages, tool calls, and metadata with proper branching support.

**Message Extraction:** Well-structured message types (`UserMessage`, `AssistantMessage`, `ToolResultMessage`) with typed content blocks enabling extraction of user prompts, assistant responses, and tool usage patterns.

**State Management:** Multiple approaches available - file-based persistence for long-term storage, session-based state for current activity, or hybrid approaches combining both.

The research identified three implementation approaches:
1. **File-based** (recommended): Direct writing to journal markdown files with immediate persistence  
2. **Session-based**: Using Pi's `appendEntry()` for state management with export commands
3. **Hybrid**: Session state for current activity plus file persistence for historical records

Full research details and implementation examples documented in [[journal-research#Pi Extension System Research: Daily Journal Implementation]].

See also: [[journal-research#Pi Extension System Research: Daily Journal Implementation]] — Complete Pi extension API research and implementation approaches for daily session journaling.
