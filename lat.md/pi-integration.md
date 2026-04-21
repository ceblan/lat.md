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

1. **Spawns documentator subagent** — launches a `pi` subprocess with `--mode json -p --no-session` to run the `documentator` agent (defined at `~/.pi/agent/agents/documentator.md`) in isolation
2. **Shows progress in footer** — updates the footer status bar via `ctx.ui.setStatus()` with the current tool call while running (no conversation message is injected — see note below)
3. **Reports results compactly** — shows "✓ lat OK" on success (collapsed by default). When expanded (Ctrl+O), the message includes a short run footer with:
   - tool call count
   - assistant iteration count
   - duration
   - documentator log file path (`/tmp/lat.log/YYYYMMDDhhmmss.txt`)

**Documenter subagent workflow:**
- Spawns `pi --mode json -p --no-session --model zai/glm-5-turbo` at `agent_end`, passing `LAT_DOCUMENTER=1` as an environment variable
- **`agent_end` hooks DO fire in `-p --no-session` mode** — the `LAT_DOCUMENTER=1` env var is the actual re-entrancy guard: it is checked at the very start of the `agent_end` handler in the subprocess and causes an immediate return, preventing infinite subprocess chains
- Documenter runs `lat check` and repeats (max 6 iterations)
- Auto-fix rules live in `~/.pi/agent/agents/documentator.md` under the "Auto-Fix Rules for Recurring Link Reintroductions" section
- Main extension waits for subagent completion (120s timeout) and parses the structured JSON status block from the final assistant message
- Documenter returns `{ status, resolvedErrors, reintroducedFixed, summary }` as its last output
- If `status: "ok"`, extension runs `lat hook cursor stop` to verify sync and emits compact "lat OK" output
- If `status: "partial"`, shows check warnings with the documentator's summary
- Falls back to inline stop-check flow if the subagent process fails (crash, timeout, parse error)
- Log files are written to `/tmp/lat.log/` (outside `lat.md/`) to prevent the documentator from treating them as stray files

> **Note on `sendMessage` in `agent_end`:** injecting a custom message with `deliverAs: "followUp"` during `agent_end` is unsafe — if `isStreaming` is still `true` at that moment, the `triggerTurn` option is bypassed and the message is delivered via `agent.followUp()`, which can trigger an API call with a conversation ending in `assistant`. Models that don't support assistant-message prefill (e.g. GLM) return a 400 error. Progress feedback during documentator execution therefore uses `ctx.ui.setStatus()` exclusively.

This behavior is shared across all agents (Cursor, Claude, Pi) via the same `lat hook cursor stop` command. See [[cli#hook]] for complete details on stop hook behavior, including handling of nested lat.md repos.

## lat init File Structure

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

Documenter subprocess logs are written to `/tmp/lat.log/` (outside the project tree) so they are never picked up by `lat check` as stray files.

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


