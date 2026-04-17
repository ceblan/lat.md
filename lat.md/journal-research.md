# Pi Extension System Research: Daily Journal Implementation

Research findings on Pi's extension API capabilities for implementing daily session journals in `lat.md/journals/YYYY-MM-DD.md` format.

**Research Date:** April 10, 2026  
**Focus:** Pi extension capabilities for implementing daily session journals

Pi's extension system provides comprehensive lifecycle hooks, session data access, and message capture capabilities suitable for implementing a daily journal feature that stores session summaries and user prompts in structured markdown files.

## Executive Summary

Key findings on Pi extension system suitability for daily journal implementation.

Pi provides excellent hooks and data access for journal implementation. The system supports session-based and file-based state management with rich access to conversation data including user prompts, assistant responses, and tool calls.

## Extension System Architecture

Pi's extension discovery, loading, and basic structure patterns.

### Discovery and Loading

Extension discovery and hot-reloading mechanisms.

Pi auto-discovers extensions from `~/.pi/agent/extensions/*.ts` (global) and `.pi/extensions/*.ts` (project-local). Extensions can be single files or directories with `index.ts` entry points. Hot-reloadable with `/reload` command.

### Extension Structure

Basic TypeScript extension structure pattern.

Extensions export a default function receiving `ExtensionAPI` to subscribe to lifecycle events and register tools/commands:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("event_name", async (event, ctx) => {
    // Handle event with session data access
  });
  
  pi.registerTool({ ... });
  pi.registerCommand("name", { ... });
}
```

## Available Lifecycle Hooks

Pi provides comprehensive lifecycle hooks for session and message monitoring.

### Session Management Hooks

Core session lifecycle events for tracking session activity.

| Hook | Timing | Key Parameters | Primary Use Cases |
|------|--------|----------------|-------------------|
| `session_start` | Session begins/loads | `reason`, `previousSessionFile?` | Initialize journal state, detect new day |
| `session_shutdown` | Before exit/switch | None | Write journal entry, cleanup |
| `agent_start` | Agent processing starts | None | Mark session activity start |
| `agent_end` | Agent processing complete | `messages` array | Capture full turn data |

### Message Lifecycle Hooks

Message and tool execution events for detailed activity tracking.

| Hook | Timing | Key Parameters | Capture Capability |
|------|--------|----------------|-------------------|
| `message_end` | Message complete | `message` object | Final message state |
| `tool_execution_start` | Tool call begins | `toolName`, `args` | Tool usage tracking |
| `tool_execution_end` | Tool call complete | `result`, `isError` | Tool outcomes |

## Session Data Access

Pi provides rich session data access via SessionManager API.

### SessionManager API

Core session data access patterns available in all event handlers.

Available via `ctx.sessionManager` in all event handlers:
- `getEntries()` - all session entries
- `getBranch()` - current conversation path  
- `getSessionFile()` - session file path
- `getLeafId()` - current leaf entry ID

### Message Data Structures

Session entries contain comprehensive message data with typing.

Session entries use structured `AgentMessage` objects with typed content blocks for text, tool calls, and images. Messages include role (`user`, `assistant`, `toolResult`), content arrays, timestamps, and metadata.

## Message/Prompt Extraction Patterns

Practical patterns for extracting user prompts and session data from Pi sessions.

### Extract User Prompts

Pattern for extracting user prompt text from session entries.

```typescript
const extractUserPrompts = (entries: SessionEntry[]): string[] => {
  return entries
    .filter(entry => 
      entry.type === "message" && 
      entry.message?.role === "user"
    )
    .map(entry => {
      const content = entry.message!.content;
      return content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map(c => c.text)
        .join("\n");
    })
    .filter(text => text.trim().length > 0);
};
```

### Extract Tool Usage

Pattern for extracting tool call data from assistant messages.

```typescript
const extractToolUsage = (entries: SessionEntry[]): Array<{tool: string, args: any}> => {
  const toolCalls = [];
  
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
    
    const content = entry.message.content;
    for (const block of content) {
      if (block.type === "toolCall") {
        toolCalls.push({
          tool: block.name,
          args: block.arguments
        });
      }
    }
  }
  
  return toolCalls;
};
```

### Session Summary Generation

Pattern for generating session summaries from conversation data.

```typescript
const generateSessionSummary = (entries: SessionEntry[]): string => {
  const userPrompts = extractUserPrompts(entries);
  const toolUsage = extractToolUsage(entries);
  const messageCount = entries.filter(e => e.type === "message").length;
  const userMessages = entries.filter(e => 
    e.type === "message" && e.message?.role === "user"
  ).length;
  
  return `Session with ${userMessages} user prompts, ${toolUsage.length} tool calls, ${messageCount} total messages`;
};
```

## Implementation Approaches

Three practical approaches for implementing daily journals with trade-offs analysis.

### Approach 1: File-Based Journal (Recommended)

Direct writing to `lat.md/journals/YYYY-MM-DD.md` with immediate persistence.

**Implementation:** Write to journal files on session events using Node.js fs operations. Monitor `session_start` for day changes and `agent_end` for session completion. Append entries with session summaries, user prompts, and tool usage.

**Pros:** Persistent across sessions, standard markdown format, easy manual browsing, integrates with lat.md workflows.

**Cons:** File I/O on each session, potential race conditions with multiple instances, manual markdown parsing needed.

### Approach 2: Session-Based State (Simple)

Store journal state in session entries via `pi.appendEntry()` with export commands.

**Implementation:** Use Pi's session state management to store journal data. Reconstruct state from session entries on load. Provide export commands to generate markdown files from session data.

**Pros:** Automatic state management via session system, no file I/O during operation, leverages Pi's branching support.

**Cons:** Journal data lost when session deleted, requires export step, session files can become large with journal data.

### Approach 3: Hybrid Approach (Best of Both)

Session state for current activity plus file persistence for historical records.

**Implementation:** Use session state for current session tracking, async file append for historical persistence. Immediate journal updates with session-based current state management.

**Pros:** Real-time persistence, session state for current activity, file-based historical record, handles multiple Pi instances gracefully.

**Cons:** More complex implementation, still requires file locking mechanisms for concurrent access.

## Journal Markdown Format

Proposed structured markdown format for daily journal files.

### Proposed Structure

Daily journal markdown structure with session details and metadata.

```markdown
# Daily Journal - 2026-04-10

> Pi coding session journal for April 10, 2026

## Session Summary

**Total Sessions:** 3  
**Total Prompts:** 12  
**Tools Used:** bash, read, write, edit, lat_search  

## Session Details

### Session 1 - 09:15 AM
**Duration:** 45 minutes  
**Session File:** `~/.pi/agent/sessions/.../session.jsonl`

**Summary:** Research Pi extension system for journal implementation

**User Prompts:**
1. Task: Research Pi coding agent extension capabilities
2. Look at the summarize extension example
3. Show me session data access patterns

**Tools Used:** read, lat_search, bash
```

## Additional Features to Consider

Advanced features for enhanced journal functionality.

### Journal Browsing Commands

Commands for viewing and navigating historical journal entries.

```typescript
pi.registerCommand("journal", {
  description: "Browse daily journals",
  handler: async (args, ctx) => {
    const date = args.trim() || new Date().toISOString().split('T')[0];
    const journalPath = getJournalPath(date);
    // Display journal content in custom UI
  }
});
```

### Session Linking

Generate links to session files for journal entries.

```typescript
const generateSessionLinks = (sessionFile: string): string => {
  if (sessionFile) {
    return `**Session File:** [\`${path.basename(sessionFile)}\`](${sessionFile})`;
  }
  return "**Session:** Ephemeral (no file)";
};
```

### Smart Summarization

AI-powered session summarization using Pi's model registry.

```typescript
const generateSmartSummary = async (entries: SessionEntry[]): Promise<string> => {
  const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-3-5");
  if (model && ctx.modelRegistry.hasApiKey(model)) {
    return await generateAISummary(entries, model);
  }
  return generateTemplateSummary(entries);
};
```

## Recommended Implementation

Three-phase implementation plan with progressive feature enhancement.

**Phase 1:** File-based approach with basic session tracking - monitor `agent_end` events, write structured markdown to `lat.md/journals/YYYY-MM-DD.md`, include user prompts and tool usage.

**Phase 2:** Enhanced features - add journal browsing commands, smart AI summarization, session linking and navigation.

**Phase 3:** Integration and polish - integrate with lat.md workflows, add search capabilities, export/import functionality.

The Pi extension system provides comprehensive hooks and data access for implementing a robust daily journal feature. The file-based approach offers optimal balance of persistence, lat.md integration, and user accessibility.
