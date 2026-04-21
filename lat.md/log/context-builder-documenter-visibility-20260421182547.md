# Documenter Subagent Visibility Investigation
**Date:** 2026-04-21

---

## 1. How Subagent Visibility Currently Works in the TUI

Breakdown of how the documenter subprocess is spawned, what TUI feedback the user sees during execution, and what is hidden.

### Current Documenter Invocation Flow

The documenter is NOT a "pi subagent" in the sense of the example subagent tool
(from `examples/extensions/subagent/`). It is a bare `spawn()` of a separate `pi`
process invoked in `agent_end`:

**File:** `~/.pi/agent/extensions/lat.ts`, lines ~394-450
```typescript
const piBin = process.env.PI_BIN || "pi";
const documenterTask = "Run post-task lat.md sync check ONLY...";
const subagentProcess = spawn(piBin, [
  "--mode", "json", "-p", "--no-session",
  "--model", "zai/glm-5-turbo",
  documenterTask,
], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});
```

Key facts:
- Invoked with `--mode json` → NDJSON event stream to stdout
- `-p` → print mode (no interactive TUI)
- `--no-session` → ephemeral, no session persistence
- `agent_end` hooks DON'T fire in `-p --no-session` mode (prevents recursion)
- stdout/stderr are captured but NOT streamed to the TUI in real time
- The extension only parses the FINAL assistant message for the JSON status block

### TUI Feedback During Documenter Execution

The extension shows ONLY these status indicators:

1. **"🔍 lat check running..."** — sent via `pi.sendMessage()` with customType
   `lat-check-status` immediately after spawning the subprocess. This is a
   **static, non-updating** message.

2. **After completion** — one of:
   - `lat-ok`: "✓ lat OK" (expandable with Ctrl+O for details)
   - `lat-check`: "lat check" with warnings (expandable)
   - Fallback inline check if subprocess fails

### What is NOT shown in the TUI

The TUI deliberately hides several aspects of documenter execution to keep the interface clean.

- Real-time progress of the documenter (which step it's on, how many errors found)
- Tool calls the documenter makes (bash, read, write, etc.)
- Intermediate output from lat check iterations
- stderr output from the subprocess

### Comparison: The "subagent" Example Tool

The Pi examples directory includes a `subagent` extension tool
(`examples/extensions/subagent/`) that provides RICH TUI rendering:

- Custom `renderCall()` — shows agent name, task preview, scope
- Custom `renderResult()` — shows:
  - Collapsed: tool call summary, final output preview, usage stats
  - Expanded (Ctrl+O): full tool call list with formatted args, markdown output
- Real-time streaming updates via `onUpdate` callback during execution
- Usage stats (tokens, cost, turns, model)

**The documenter does NOT use this tool** — it's a raw spawn().

---

## 2. Parameters Controlling Visibility

Analysis of the documenter agent frontmatter fields and what actually controls TUI rendering.

### Documenter Agent Frontmatter

**File:** `~/.pi/agent/agents/documenter.md`
```yaml
---
name: documenter
description: Ensures lat.md documentation stays in sync...
tools: read, grep, find, ls, bash, edit, write
model: zai/glm-5-turbo
systemPromptMode: replace
inheritProjectContext: true
inheritSkills: false
skill: lat-md
output: documentation-report.md
defaultProgress: true
---
```

Analysis of frontmatter fields:
- `output: documentation-report.md` — **NOT recognized by pi core**. This is
  convention-only (the documenter's prompt tells it to write to this file).
  The lat.ts extension does NOT read this file.
- `defaultProgress: true` — **NOT recognized by pi core**. No effect on visibility.
- `inheritProjectContext: true` — **NOT recognized by pi core** as a frontmatter
  field for agent `.md` files. The subagent example's `parseFrontmatter()` only
  reads `name`, `description`, `tools`, `model`.
- `systemPromptMode: replace` — **NOT recognized** by pi core's agent loading.
- `skill: lat-md` — **NOT auto-loaded** by pi core when spawning with raw args.
  The documenter's system prompt explicitly mentions loading the skill.

**These fields are documentation/convention for the documenter's prompt, but
they do NOT control TUI visibility or behavior through any Pi mechanism.**

### What ACTUALLY Controls Visibility

The visibility of the documenter is entirely controlled by:

1. **`lat.ts` extension code** — how it spawns, captures, and renders output
2. **`pi.sendMessage()` customTypes** — `lat-check-status`, `lat-ok`, `lat-check`
3. **`pi.registerMessageRenderer()`** — custom renderers for those types
4. **`--mode json`** — determines output format (NDJSON events)

---

## 3. Is It Possible to Amplify Documenter Visibility in the TUI?

Evaluation of four approaches for improving real-time feedback during documenter execution.

### Option A: Switch to the subagent tool approach

Use the `subagent` extension tool (or a similar pattern) to invoke the
documenter. This would give:
- Real-time streaming of tool calls and output via `onUpdate`
- Rich `renderCall()` / `renderResult()` with collapsed/expanded views
- Usage stats display

**Challenge:** The documenter is spawned from `agent_end`, not from a tool call.
The `subagent` tool's rendering only works when invoked as a tool during an
active agent turn. During `agent_end`, there's no active tool call to render
into. This approach **does not work** for the current architecture.

### Option B: Stream NDJSON events to a custom TUI message

Modify `lat.ts` to:
1. Parse NDJSON events as they arrive from stdout
2. Extract tool calls, text output, progress
3. Update a custom message in real time via `pi.sendMessage()`

**Potential issue:** `pi.sendMessage()` with `deliverAs: "followUp"` likely
creates a NEW message each time, not updating an existing one. This could
flood the TUI with messages. Needs testing.

### Option C: Use `ctx.ui.setStatus()` / `ctx.ui.setWidget()` ⭐ RECOMMENDED

These are fire-and-forget methods available even outside tool contexts:
- `ctx.ui.setStatus(key, text)` — shows text in the **footer status bar**
- `ctx.ui.setWidget(key, lines)` — shows a **widget above the editor**

**Advantages:**
- These update **in-place** (no message flooding)
- Available when `ctx.hasUI` is true
- The `agent_end` event provides a `ctx` parameter

```typescript
pi.on("agent_end", async (event, ctx) => {
  // ...
  ctx.ui.setStatus("lat-doc", "🔍 Step 3: lat check (2/6 iterations)...");
  // On completion:
  ctx.ui.setStatus("lat-doc", ""); // Clear
});
```

### Option D: Use a Custom TUI Component (`ctx.ui.custom()`)

Most powerful but complex. Best reserved for interactive displays.

---

## 4. Log File Approach (Recommended Fallback)

Even with TUI improvements, persisting full documenter output to a log file provides debuggability and auditability.

### Why Logging is Needed

Even with TUI improvements, the documenter's full output is valuable for:
- Debugging failed runs
- Understanding what the documenter changed
- Post-mortem analysis of auto-fix behavior

### Implementation: Tee stdout/stderr to a log file

**Path:** `lat.md/log/YYYYMMDDhhmmss.txt` (using `.txt` since `.log` is prohibited
by `~/.prohibit`)

**Note:** The user originally requested `.log` extension but `~/.prohibit` blocks
`*.log` files globally. The actual implementation should use an allowed extension
like `.txt`, `.md`, or store logs elsewhere (e.g., `/tmp/lat-documenter/`).

### Implementation Code

Reference implementation for teeing stdout/stderr to a timestamped log file.

```typescript
import * as fs from "node:fs";
import * as path from "path";

// In agent_end handler, before spawn:
const logDir = path.join(process.cwd(), "lat.md", "log");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const startTime = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const logFileName = [
  startTime.getFullYear(),
  pad(startTime.getMonth() + 1),
  pad(startTime.getDate()),
  pad(startTime.getHours()),
  pad(startTime.getMinutes()),
  pad(startTime.getSeconds()),
].join("");

const logPath = path.join(logDir, `${logFileName}.txt`);
const logStream = fs.createWriteStream(logPath, { flags: "a" });

// Write header
logStream.write(`=== Documenter Log ===\n`);
logStream.write(`Started: ${startTime.toISOString()}\n`);
logStream.write(`Task: ${documenterTask}\n\n`);

// Tee stdout to log AND parse for status updates
subagentProcess.stdout.on("data", (data: Buffer) => {
  const text = data.toString();
  stdout += text;
  logStream.write(text);

  // Parse NDJSON for real-time status updates
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      if (evt.type === "tool_execution_start") {
        const summary = formatToolEvent(evt);
        if (ctx.hasUI) ctx.ui.setStatus("lat-doc", `🔍 ${summary}`);
        logStream.write(`[TOOL] ${evt.toolName}: ${JSON.stringify(evt.args).slice(0, 100)}\n`);
      }
      if (evt.type === "message_end" && evt.message?.role === "assistant") {
        logStream.write(`[ASSISTANT] step completed\n`);
      }
    } catch { /* not JSON, skip */ }
  }
});

subagentProcess.stderr.on("data", (data: Buffer) => {
  stderr += data.toString();
  logStream.write(`[STDERR] ${data.toString()}`);
});

// On close:
subagentProcess.on("close", (code) => {
  const endTime = new Date();
  const duration = (endTime.getTime() - startTime.getTime()) / 1000;
  logStream.write(`\n=== End ===\n`);
  logStream.write(`Exit code: ${code}\n`);
  logStream.write(`Duration: ${duration.toFixed(1)}s\n`);
  logStream.write(`Finished: ${endTime.toISOString()}\n`);
  logStream.end();

  if (ctx.hasUI) ctx.ui.setStatus("lat-doc", ""); // Clear status
});
```

---

## 5. Recommended Implementation Plan

Three-phase rollout from logging to status bar updates to enriched completion messages.

### Phase 1: Log File (Quick Win)

Capture subagent stdout/stderr to timestamped log files in `lat.md/log/` for immediate debugging visibility.

1. Modify `~/.pi/agent/extensions/lat.ts` agent_end handler
   - Create `lat.md/log/` directory if not exists
   - Generate log filename from spawn timestamp (`YYYYMMDDhhmmss.txt`)
   - Open `WriteStream` before spawn
   - Tee stdout and stderr to log
   - Write structured header/footer with timestamps, exit code, duration

2. Sync changes to `templates/pi-extension.ts`

### Phase 2: Status Bar Updates

Add real-time footer status updates by parsing NDJSON tool events.

1. Parse NDJSON `tool_execution_start` events for live progress
2. Use `ctx.ui.setStatus("lat-doc", ...)` for footer updates
3. Clear status on completion

### Phase 3: Enhanced Completion Message

Enrich the final lat-ok/lat-check messages with log path, tool call count, and duration.

1. Include log file path in the `lat-ok` / `lat-check` message content
2. Show number of tool calls made and lat check iterations
3. Show duration in seconds

### Files to Modify

| File | Purpose |
|------|---------|
| `~/.pi/agent/extensions/lat.ts` | Active extension (lines ~394-490) |
| `templates/pi-extension.ts` | Template source (must sync) |

### Log File Format

Example of the structured log output written to `lat.md/log/YYYYMMDDhhmmss.txt`.

```
=== Documenter Log ===
Started: 2026-04-21T18:00:00.000Z
Task: Run post-task lat.md sync check ONLY. Skip Steps 1-2...

[NDJSON events stream here]

[TOOL] bash: {"command":"lat check"}
[ASSISTANT] step completed
[TOOL] read: {"path":"lat.md/some-file.md"}
[TOOL] edit: {"path":"lat.md/some-file.md"}
[TOOL] bash: {"command":"lat check"}
[ASSISTANT] step completed

=== End ===
Exit code: 0
Duration: 45.2s
Finished: 2026-04-21T18:00:45.200Z
```

---

## 6. Risks and Considerations

Potential issues and mitigations for the logging and visibility improvements.

| Risk | Mitigation |
|------|-----------|
| Log files accumulate over time | Add cleanup logic (keep last N files, or let user manage) |
| Log writes slow down documenter | Use `createWriteStream` (async, buffered) |
| `ctx.ui.setStatus` not available in `-p` mode | Guard with `ctx.hasUI` check |
| Status bar may conflict with other extensions | Use unique key `"lat-doc"` |
| `lat.md/log/` may not exist in all projects | Create on first use with `mkdirSync({ recursive: true })` |
| `.log` extension blocked by `~/.prohibit` | Use `.txt` extension instead |
| Template drift between `lat.ts` and `pi-extension.ts` | Must sync both files |

---

## 7. Key Files Referenced

Source files and directories involved in the documenter visibility investigation.

| File | Lines | Relevance |
|------|-------|-----------|
| `~/.pi/agent/extensions/lat.ts` | 394-490 | Documenter spawn and result handling |
| `~/.pi/agent/extensions/lat.ts` | 260-320 | Message renderers (lat-check-status, lat-ok, lat-check) |
| `~/.pi/agent/agents/documenter.md` | Full file | Agent definition, workflow steps |
| `templates/pi-extension.ts` | Mirror of lat.ts | Must stay in sync |
| `lat.md/log/` | Directory | Log output location (currently empty) |
| `~/.prohibit` | Global | Blocks `*.log` files — use `.txt` instead |

### Pi Documentation Referenced

Pi docs and examples consulted during this investigation.

| Doc | Key Information |
|-----|-----------------|
| `docs/extensions.md` | Extension API, events, `ctx.ui.setStatus/setWidget`, `pi.sendMessage` |
| `docs/tui.md` | TUI components, custom rendering |
| `docs/json.md` | NDJSON event types for `--mode json` |
| `examples/extensions/subagent/` | Rich subagent tool with TUI rendering pattern |
