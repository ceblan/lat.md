import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, keyHint } from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-tui";
import { Box, Markdown, Text } from "@mariozechner/pi-tui";
// import journalExtension from "./journal.js";

const PREVIEW_LINES = 4;

function collapsibleResult(
  result: { content: Array<{ type: string; text?: string }> },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
) {
  const text = result.content?.[0]?.type === "text" ? (result.content[0] as { type: "text"; text: string }).text : "";
  if (!text) return new Text(theme.fg("dim", "(empty)"), 0, 0);
  if (options.isPartial) return new Text(theme.fg("dim", "…"), 0, 0);
  const mdTheme = getMarkdownTheme();
  if (options.expanded) return new Markdown(text, 0, 0, mdTheme);

  const lines = text.split("\n");
  if (lines.length <= PREVIEW_LINES) return new Markdown(text, 0, 0, mdTheme);

  const preview = lines.slice(0, PREVIEW_LINES).join("\n");
  const remaining = lines.length - PREVIEW_LINES;
  const hint = keyHint("expandTools", "to expand");
  return new Text(
    preview + "\n" +
    theme.fg("dim", `… ${remaining} more lines (${hint})`),
    0, 0,
  );
}

/** Absolute path to the lat binary, injected by `lat init`. */
const LAT = "__LAT_BIN__";

function run(args: string[], cwd?: string): string {
  const { execSync } = require("child_process") as typeof import("child_process");
  return execSync(`${LAT} ${args.join(" ")}`, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf-8",
    timeout: 30_000,
  });
}

function tryRun(args: string[]): string {
  try {
    return run(args);
  } catch {
    return "";
  }
}

/**
 * Parse the documentator subagent's NDJSON stdout to extract the structured
 * JSON status block from the final assistant message.
 */
function parseDocumenterOutput(stdout: string): {
  status: "ok" | "partial";
  resolvedErrors: number;
  reintroducedFixed: number;
  summary: string;
} | null {
  let finalText = "";
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      // Look for message_end events with assistant role
      if (evt.type === "message_end" && evt.message?.role === "assistant") {
        const textBlocks = (evt.message.content || [])
          .filter((c: { type: string }) => c.type === "text")
          .map((c: { text: string }) => c.text);
        finalText = textBlocks.join("\n");
      }
    } catch {
      // Not JSON, skip
    }
  }
  if (!finalText) return null;

  // Extract the JSON status block from the last fenced code block
  const jsonMatch = finalText.match(/\{[\s\S]*?"status"[\s\S]*?\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Normalize status: accept "done", "ok", "success" as "ok"
    const rawStatus = String(parsed.status || "");
    const status: "ok" | "partial" = (rawStatus === "ok" || rawStatus === "done" || rawStatus === "success")
      ? "ok"
      : rawStatus === "partial"
        ? "partial"
        : "ok"; // default to ok if lat check passed
    return {
      status,
      resolvedErrors: typeof parsed.resolvedErrors === "number" ? parsed.resolvedErrors : (typeof parsed.fixes === "number" ? parsed.fixes : 0),
      reintroducedFixed: typeof parsed.reintroducedFixed === "number" ? parsed.reintroducedFixed : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary : (status === "ok" ? "lat.md is in sync" : "Some errors remain"),
    };
  } catch {
    // JSON parse failed
  }
  return null;
}

export default async function (pi: ExtensionAPI) {
  // ── Tools ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "lat_search",
    label: "lat search",
    description: "Semantic search across lat.md sections using embeddings",
    promptSnippet: "Search lat.md documentation by meaning",
    promptGuidelines: [
      "Use before starting any task to find relevant design context",
      "Search results include section IDs you can pass to lat_section",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query in natural language" }),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 5)", default: 5 }),
      ),
    }),
    async execute(_id, params) {
      const args = ["search", JSON.stringify(params.query)];
      if (params.limit) args.push("--limit", String(params.limit));
      const output = tryRun(args);
      return {
        content: [{ type: "text", text: output || "No results found." }],
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("lat search ")) +
        theme.fg("dim", `"${args.query}"`),
        0, 0,
      );
    },
    renderResult: collapsibleResult,
  });

  pi.registerTool({
    name: "lat_section",
    label: "lat section",
    description:
      "Show full content of a lat.md section with outgoing/incoming refs",
    promptSnippet: "Read a specific lat.md section",
    parameters: Type.Object({
      query: Type.String({
        description:
          'Section ID or name (e.g. "cli#init", "Tests#User login")',
      }),
    }),
    async execute(_id, params) {
      const output = tryRun(["section", JSON.stringify(params.query)]);
      return {
        content: [
          { type: "text", text: output || "Section not found." },
        ],
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("lat section ")) +
        theme.fg("dim", `"${args.query}"`),
        0, 0,
      );
    },
    renderResult: collapsibleResult,
  });

  pi.registerTool({
    name: "lat_locate",
    label: "lat locate",
    description:
      "Find a section by name (exact, subsection tail, or fuzzy match)",
    promptSnippet: "Find a lat.md section by name",
    parameters: Type.Object({
      query: Type.String({ description: "Section name to locate" }),
    }),
    async execute(_id, params) {
      const output = tryRun(["locate", JSON.stringify(params.query)]);
      return {
        content: [
          { type: "text", text: output || "No sections matching query." },
        ],
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("lat locate ")) +
        theme.fg("dim", `"${args.query}"`),
        0, 0,
      );
    },
  });

  pi.registerTool({
    name: "lat_check",
    label: "lat check",
    description:
      "Validate all wiki links and code refs in lat.md. Returns errors or 'All checks passed'",
    promptSnippet: "Validate lat.md links and code refs",
    parameters: Type.Object({}),
    async execute() {
      try {
        const output = run(["check"]);
        return { content: [{ type: "text", text: output }] };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string };
        return {
          content: [{ type: "text", text: e.stdout || e.stderr || "Check failed" }],
          isError: true,
        };
      }
    },
    renderCall(_args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("lat check")),
        0, 0,
      );
    },
  });

  pi.registerTool({
    name: "lat_expand",
    label: "lat expand",
    description:
      "Expand [[refs]] in text to resolved file locations and context",
    promptSnippet: "Resolve [[wiki links]] in text",
    parameters: Type.Object({
      text: Type.String({ description: "Text containing [[refs]] to expand" }),
    }),
    async execute(_id, params) {
      const output = tryRun(["expand", JSON.stringify(params.text)]);
      return {
        content: [{ type: "text", text: output || params.text }],
      };
    },
    renderCall(args, theme) {
      const preview = args.text.length > 60 ? args.text.slice(0, 60) + "…" : args.text;
      return new Text(
        theme.fg("toolTitle", theme.bold("lat expand ")) +
        theme.fg("dim", `"${preview}"`),
        0, 0,
      );
    },
  });

  pi.registerTool({
    name: "lat_refs",
    label: "lat refs",
    description: "Find what references a given section",
    promptSnippet: "Find incoming references to a lat.md section",
    parameters: Type.Object({
      query: Type.String({
        description: 'Section ID (e.g. "cli#init", "file#Section")',
      }),
    }),
    async execute(_id, params) {
      const output = tryRun(["refs", JSON.stringify(params.query)]);
      return {
        content: [{ type: "text", text: output || "No references found." }],
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("lat refs ")) +
        theme.fg("dim", `"${args.query}"`),
        0, 0,
      );
    },
  });

  // ── Message renderers ────────────────────────────────────────────

  pi.registerMessageRenderer("lat-reminder", (message, { expanded }, theme) => {
    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    if (expanded) {
      box.addChild(new Text(theme.fg("accent", "lat.md"), 0, 0));
      box.addChild(new Markdown(message.content, 0, 0, getMarkdownTheme()));
    } else {
      const hint = keyHint("expandTools", "to expand");
      box.addChild(new Text(
        theme.fg("accent", "lat.md") + " " +
        theme.fg("dim", `Search lat.md before starting work. Keep lat.md/ in sync. (${hint})`),
        0, 0,
      ));
    }
    return box;
  });

  pi.registerMessageRenderer("lat-check", (message, { expanded }, theme) => {
    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    if (expanded) {
      box.addChild(new Text(theme.fg("warning", "lat check"), 0, 0));
      box.addChild(new Markdown(message.content, 0, 0, getMarkdownTheme()));
    } else {
      const hint = keyHint("expandTools", "to expand");
      const firstLine = message.content.split("\n")[0];
      box.addChild(new Text(
        theme.fg("warning", "lat check") + " " +
        theme.fg("dim", `${firstLine} (${hint})`),
        0, 0,
      ));
    }
    return box;
  });

  // Renderer for successful completion (collapsed by default, expandable)
  pi.registerMessageRenderer("lat-ok", (message, { expanded }, theme) => {
    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    if (expanded) {
      box.addChild(new Text(theme.fg("success", "✓ lat OK"), 0, 0));
      if (message.content) {
        box.addChild(new Markdown(message.content, 0, 0, getMarkdownTheme()));
      }
    } else {
      const hint = keyHint("expandTools", "to expand");
      box.addChild(new Text(
        theme.fg("success", "✓ lat OK") + " " +
        theme.fg("dim", `(${hint})`),
        0, 0,
      ));
    }
    return box;
  });

  // Register journal extension first so its agent_end hook runs before
  // lat worker checks. This prevents journal writes from reintroducing
  // broken refs after lat validation in the same turn.
  // await journalExtension(pi);

  // ── Lifecycle hooks ────────────────────────────────────────────────

  // Guards to prevent infinite loops:
  // - agentEndFired: prevents agent_end from firing twice per prompt
  // - latCheckInProgress: prevents starting multiple lat checks
  // - latCheckCompletedForPrompt: prevents re-running after completion
  let agentEndFired = false;
  let latCheckInProgress = false;
  let latCheckCompletedForPrompt = false;

  pi.on("before_agent_start", async () => {
    agentEndFired = false;
    latCheckInProgress = false;
    latCheckCompletedForPrompt = false; // Reset for new prompt

    const reminder = [
      "Before starting work, run `lat_search` with one or more queries describing the user's intent.",
      "ALWAYS do this, even when the task seems straightforward — search results may reveal critical design details, protocols, or constraints.",
      "Use `lat_section` to read the full content of relevant matches.",
      "Do not read files, write code, or run commands until you have searched.",
      "",
      "Remember: `lat.md/` must stay in sync with the codebase. If you change code, update the relevant sections in `lat.md/` and run `lat_check` before finishing.",
    ].join("\n");

    return {
      message: {
        customType: "lat-reminder",
        content: reminder,
        display: true,
      },
    };
  });

  pi.on("agent_end", async (_event, ctx) => {
    // Guard: don't spawn a documentator if we ARE the documentator subprocess.
    // agent_end DOES fire in -p --no-session mode, so without this guard
    // every documentator would spawn another documentator → infinite loop.
    if (process.env.LAT_DOCUMENTER === "1") return;
    // Prevent loops and duplicates
    if (agentEndFired || latCheckInProgress || latCheckCompletedForPrompt) return;
    agentEndFired = true;

    // Check if lat.md directory exists
    const fs = require("fs") as typeof import("node:fs");
    const path = require("path") as typeof import("node:path");
    const latDir = path.join(process.cwd(), "lat.md");
    if (!fs.existsSync(latDir)) return;

    // Launch documentator subagent to run lat check in a separate process
    latCheckInProgress = true;

    const { spawn } = require("child_process") as typeof import("node:child_process");

    // Spawn the `documentator` agent as an isolated pi subprocess.
    // --no-session for ephemeral execution, --mode json for parseable NDJSON output.
    // NOTE: agent_end hooks DO fire in -p --no-session mode. The LAT_DOCUMENTER=1
    // env var is the actual re-entrancy guard (see check at top of this handler).
    const piBin = process.env.PI_BIN || "pi";
    const documentatorTask = "Run post-task lat.md sync check ONLY. Skip Steps 1-2 (commits, @lat tags). Execute Step 3 (link integrity with auto-fix loop). Then end your response with the required JSON status block.";

    // ── Documenter subprocess logging ────────────────────────────────
    // Use /tmp/lat.log/ for logs, NOT lat.md/log/ — the documentator treats
    // any .txt file inside lat.md/ as a stray file and tries to move/delete it.
    const startTime = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${startTime.getFullYear()}${pad2(startTime.getMonth() + 1)}${pad2(startTime.getDate())}${pad2(startTime.getHours())}${pad2(startTime.getMinutes())}${pad2(startTime.getSeconds())}`;
    const os = require("os") as typeof import("node:os");
    const logDir = path.join(os.tmpdir(), "lat.log");
    const logPath = path.join(logDir, `${timestamp}.txt`);

    let logStream: import("node:fs").WriteStream | null = null;
    try {
      fs.mkdirSync(logDir, { recursive: true });
      logStream = fs.createWriteStream(logPath, { flags: "a" });
      logStream.write("=== documentator subprocess log ===\n");
      logStream.write(`Started: ${startTime.toISOString()}\n`);
      logStream.write(`Task: ${documentatorTask}\n\n`);
    } catch {
      // If logging fails, continue without affecting lat-ok/lat-check behavior.
      logStream = null;
    }

    const subagentProcess = spawn(piBin, [
      "--mode", "json", "-p", "--no-session",
      "--model", "zai/glm-5-turbo",
      documentatorTask,
    ], {
      cwd: process.cwd(),
      // LAT_DOCUMENTER=1 tells the lat.ts extension loaded inside the subprocess
      // not to spawn another documentator when agent_end fires there.
      env: { ...process.env, LAT_DOCUMENTER: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Phase 2: real-time TUI visibility (status bar only; no incremental messages).
    if (ctx?.hasUI) ctx.ui.setStatus("lat-doc", "🔍 documentator: starting...");

    // Parse NDJSON event stream to count tool calls and assistant iterations.
    // Also update the status bar on tool starts.
    let toolCalls = 0;
    let iterations = 0;
    let durationMs = 0;
    let ndjsonBuffer = "";
    let lastStatus: string | null = null;
    const parseNdjsonChunk = (chunk: string) => {
      ndjsonBuffer += chunk;
      while (true) {
        const newlineIdx = ndjsonBuffer.indexOf("\n");
        if (newlineIdx === -1) break;
        const line = ndjsonBuffer.slice(0, newlineIdx).trim();
        ndjsonBuffer = ndjsonBuffer.slice(newlineIdx + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "tool_execution_start") {
            toolCalls++;
            if (ctx?.hasUI) {
              const rawToolName = evt.toolName ?? evt.tool ?? evt.tool_name ?? evt.name;
              const toolName = typeof rawToolName === "string" ? rawToolName : "tool";
              const next = `🔍 documentator: ${toolName}`;
              if (next !== lastStatus) {
                ctx.ui.setStatus("lat-doc", next);
                lastStatus = next;
              }
            }
          }
          if (evt.type === "message_end" && evt.message?.role === "assistant") iterations++;
        } catch {
          // ignore non-JSON lines
        }
      }
    };

    const checkResult = await new Promise<{
      ok: boolean;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      exitCode: number | null;
    }>((resolve) => {
      let stdout = "";
      let stderr = "";
      let done = false;
      let timer: NodeJS.Timeout;

      const finish = (result: {
        ok: boolean;
        stdout: string;
        stderr: string;
        timedOut: boolean;
        exitCode: number | null;
      }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);

        // Flush any remaining NDJSON line and write footer.
        parseNdjsonChunk("\n");

        const endTime = new Date();
        durationMs = endTime.getTime() - startTime.getTime();

        if (logStream) {
          const exitCodeText = result.timedOut
            ? "timeout"
            : (result.exitCode === null ? "null" : String(result.exitCode));

          logStream.write("\n=== documentator subprocess finished ===\n");
          logStream.write(`Exit code: ${exitCodeText}\n`);
          logStream.write(`Tool calls: ${toolCalls}\n`);
          logStream.write(`Iterations: ${iterations}\n`);
          logStream.write(`Duration: ${(durationMs / 1000).toFixed(1)}s\n`);
          logStream.write(`Finished: ${endTime.toISOString()}\n`);
          logStream.end();
          logStream = null;
        }

        if (ctx?.hasUI) ctx.ui.setStatus("lat-doc", undefined);

        resolve(result);
      };

      timer = setTimeout(() => {
        try {
          subagentProcess.kill("SIGKILL");
        } catch {
          // ignore kill errors
        }
        finish({ ok: false, stdout, stderr: `${stderr}\ndocumentator subagent timed out after 120s`, timedOut: true, exitCode: null });
      }, 120_000);

      subagentProcess.stdout.on("data", (data: Buffer) => {
        if (done) return;
        const text = data.toString();
        stdout += text;
        if (logStream) logStream.write(text);
        parseNdjsonChunk(text);
      });

      subagentProcess.stderr.on("data", (data: Buffer) => {
        if (done) return;
        const text = data.toString();
        stderr += text;
        if (logStream) logStream.write(text);
      });

      subagentProcess.on("error", (err: Error) => {
        finish({ ok: false, stdout, stderr: `${stderr}\n${err.message}`.trim(), timedOut: false, exitCode: null });
      });

      subagentProcess.on("close", (code: number | null) => {
        finish({ ok: code === 0, stdout, stderr, timedOut: false, exitCode: code });
      });
    });

    // Parse the final assistant message from the NDJSON event stream.
    // The documentator agent emits a JSON status block as its last output.
    const payload = parseDocumenterOutput(checkResult.stdout);

    latCheckInProgress = false;

    let existingLogPath: string | undefined;
    try {
      if (fs.existsSync(logPath)) existingLogPath = logPath;
    } catch {
      // ignore existsSync errors
    }

    if (payload && (payload.status === "ok" || payload.status === "partial")) {
      // Run lat hook cursor stop to verify sync status
      const hasErrors = payload.status === "partial";
      const stats = { logPath: existingLogPath, toolCalls, iterations, durationMs };
      await runLatHookAndShowResult(payload.resolvedErrors, payload.summary, payload.reintroducedFixed, hasErrors, stats);
    } else {
      // Fallback to inline execution if subagent failed
      const errMsg = checkResult.stderr || checkResult.stdout || "documentator subagent failed";
      await runLatCheckInline(checkResult.timedOut ? `documentator subagent timed out after 120s` : errMsg, existingLogPath);
    }

    async function runLatHookAndShowResult(
      resolvedErrors = 0,
      workerSummary = "",
      reintroducedFixed = 0,
      hasErrors = false,
      stats?: { logPath?: string; toolCalls?: number; iterations?: number; durationMs?: number },
    ): Promise<void> {
      const raw = tryRun(["hook", "cursor", "stop"]).trim();
      const workerPrefix = resolvedErrors > 0
        ? `documentator resolved ${resolvedErrors} error(s) (${reintroducedFixed} reintroduced-link fix(es)). ${workerSummary}`
        : (workerSummary || "lat.md is in sync with the codebase.");

      const statsFooter = stats
        ? `\n\n---\n📋 ${stats.toolCalls ?? 0} tool calls · ${stats.iterations ?? 0} iterations · ${typeof stats.durationMs === "number" ? (stats.durationMs / 1000).toFixed(1) : "?"}s` +
          (stats.logPath ? ` · log: ${stats.logPath}` : "")
        : "";

      if (!raw) {
        // No issues - lat.md is in sync
        latCheckCompletedForPrompt = true;
        pi.sendMessage(
          { customType: "lat-ok", content: workerPrefix + statsFooter, display: true },
          { deliverAs: "followUp", triggerTurn: false }
        );
        return;
      }

      let reason = "";
      try {
        const parsed = JSON.parse(raw) as { followup_message?: unknown };
        if (typeof parsed.followup_message === "string") {
          reason = parsed.followup_message;
        }
      } catch {
        reason = raw;
      }

      if (!reason) {
        latCheckCompletedForPrompt = true;
        pi.sendMessage(
          { customType: "lat-ok", content: workerPrefix + statsFooter, display: true },
          { deliverAs: "followUp", triggerTurn: false }
        );
        return;
      }

      if (hasErrors) {
        // Documenter reported partial — show check warning
        latCheckCompletedForPrompt = true;
        pi.sendMessage(
          { customType: "lat-check", content: `${workerPrefix}\n\n${reason}${statsFooter}`, display: true },
          { deliverAs: "followUp", triggerTurn: false }
        );
        return;
      }

      // Show OK but with a reminder about what needs to be done
      latCheckCompletedForPrompt = true;
      pi.sendMessage(
        { customType: "lat-ok", content: `${workerPrefix}\n\nlat.md sync reminder: ${reason}${statsFooter}`, display: true },
        { deliverAs: "followUp", triggerTurn: false }
      );
    }
  });

  // Fallback: run lat check inline if subagent fails
  async function runLatCheckInline(backgroundFailure?: string, logPath?: string): Promise<void> {
    // Delegate stop checks to lat's centralized hook logic.
    // Reuses the same behavior as Cursor/Claude integration, so Pi stays in sync
    // with future stop-check improvements (including nested lat.md repos).
    const raw = tryRun(["hook", "cursor", "stop"]).trim();

    let reason = "";
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { followup_message?: unknown };
        if (typeof parsed.followup_message === "string") {
          reason = parsed.followup_message;
        }
      } catch {
        // If output isn't JSON for any reason, fall back to raw text.
        reason = raw;
      }
    }

    latCheckCompletedForPrompt = true;

    const logFooter = logPath ? `\n\n---\n📋 log: ${logPath}` : "";

    if (!reason) {
      // Even if the background process failed, provide explicit completion feedback.
      pi.sendMessage(
        {
          customType: "lat-ok",
          content: (backgroundFailure
            ? `lat check fallback completed. No sync warnings from stop hook.\n\nBackground process error:\n${backgroundFailure}`
            : "lat.md is in sync with the codebase.") + logFooter,
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: false },
      );
      return;
    }

    pi.sendMessage(
      { customType: "lat-check", content: reason + logFooter, display: true },
      { deliverAs: "followUp", triggerTurn: false },
    );
  }
}
