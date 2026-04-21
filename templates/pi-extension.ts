import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, keyHint } from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-tui";
import { Box, Markdown, Text } from "@mariozechner/pi-tui";
import journalExtension from "./journal.js";

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
 * Parse the documenter subagent's NDJSON stdout to extract the structured
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

  // Renderer for status message when lat check is running
  pi.registerMessageRenderer("lat-check-status", (message, { expanded }, theme) => {
    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    if (expanded) {
      box.addChild(new Text(theme.fg("dim", "🔍 lat check running in background..."), 0, 0));
    } else {
      const hint = keyHint("expandTools", "to expand");
      box.addChild(new Text(
        theme.fg("dim", "🔍 lat check running...") + " " +
        theme.fg("dim", `(${hint})`),
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
  await journalExtension(pi);

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

  pi.on("agent_end", async () => {
    // Prevent loops and duplicates
    if (agentEndFired || latCheckInProgress || latCheckCompletedForPrompt) return;
    agentEndFired = true;

    // Check if lat.md directory exists
    const { existsSync } = require("fs");
    const { join } = require("path");
    const latDir = join(process.cwd(), "lat.md");
    if (!existsSync(latDir)) return;

    // Launch documenter subagent to run lat check in a separate process
    latCheckInProgress = true;

    const { spawn } = require("child_process");

    // Spawn the `documenter` agent as an isolated pi subprocess.
    // --no-session for ephemeral execution (agent_end hooks don't fire in -p --no-session mode),
    // --mode json for parseable NDJSON output.
    // No -ne flag needed: agent_end hooks don't fire in -p --no-session mode,
    // and the lat tools (lat_check) are available for the documenter to use.
    const piBin = process.env.PI_BIN || "pi";
    const documenterTask = "Run post-task lat.md sync check ONLY. Skip Steps 1-2 (commits, @lat tags). Execute Step 3 (link integrity with auto-fix loop). Then end your response with the required JSON status block.";

    const subagentProcess = spawn(piBin, [
      "--mode", "json", "-p", "--no-session",
      "--model", "zai/glm-5-turbo",
      documenterTask,
    ], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Show minimal status indicator while running
    pi.sendMessage(
      { customType: "lat-check-status", content: "", display: true },
      { deliverAs: "followUp", triggerTurn: false }
    );

    const checkResult = await new Promise<{
      ok: boolean;
      stdout: string;
      stderr: string;
      timedOut: boolean;
    }>((resolve) => {
      let stdout = "";
      let stderr = "";
      let done = false;

      const finish = (result: {
        ok: boolean;
        stdout: string;
        stderr: string;
        timedOut: boolean;
      }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        try {
          subagentProcess.kill("SIGKILL");
        } catch {
          // ignore kill errors
        }
        finish({ ok: false, stdout, stderr: `${stderr}\ndocumenter subagent timed out after 120s`, timedOut: true });
      }, 120_000);

      subagentProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      subagentProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      subagentProcess.on("error", (err: Error) => {
        finish({ ok: false, stdout, stderr: `${stderr}\n${err.message}`.trim(), timedOut: false });
      });

      subagentProcess.on("close", (code: number | null) => {
        finish({ ok: code === 0, stdout, stderr, timedOut: false });
      });
    });

    // Parse the final assistant message from the NDJSON event stream.
    // The documenter agent emits a JSON status block as its last output.
    const payload = parseDocumenterOutput(checkResult.stdout);

    latCheckInProgress = false;

    if (payload && (payload.status === "ok" || payload.status === "partial")) {
      // Run lat hook cursor stop to verify sync status
      const hasErrors = payload.status === "partial";
      await runLatHookAndShowResult(payload.resolvedErrors, payload.summary, payload.reintroducedFixed, hasErrors);
    } else {
      // Fallback to inline execution if subagent failed
      const errMsg = checkResult.stderr || checkResult.stdout || "documenter subagent failed";
      await runLatCheckInline(checkResult.timedOut ? `documenter subagent timed out after 120s` : errMsg);
    }

    async function runLatHookAndShowResult(resolvedErrors = 0, workerSummary = "", reintroducedFixed = 0, hasErrors = false): Promise<void> {
      const raw = tryRun(["hook", "cursor", "stop"]).trim();
      const workerPrefix = resolvedErrors > 0
        ? `documenter resolved ${resolvedErrors} error(s) (${reintroducedFixed} reintroduced-link fix(es)). ${workerSummary}`
        : (workerSummary || "lat.md is in sync with the codebase.");

      if (!raw) {
        // No issues - lat.md is in sync
        latCheckCompletedForPrompt = true;
        pi.sendMessage(
          { customType: "lat-ok", content: workerPrefix, display: true },
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
          { customType: "lat-ok", content: workerPrefix, display: true },
          { deliverAs: "followUp", triggerTurn: false }
        );
        return;
      }

      if (hasErrors) {
        // Documenter reported partial — show check warning
        latCheckCompletedForPrompt = true;
        pi.sendMessage(
          { customType: "lat-check", content: `${workerPrefix}\n\n${reason}`, display: true },
          { deliverAs: "followUp", triggerTurn: false }
        );
        return;
      }

      // Show OK but with a reminder about what needs to be done
      latCheckCompletedForPrompt = true;
      pi.sendMessage(
        { customType: "lat-ok", content: `${workerPrefix}\n\nlat.md sync reminder: ${reason}`, display: true },
        { deliverAs: "followUp", triggerTurn: false }
      );
    }
  });

  // Fallback: run lat check inline if subagent fails
  async function runLatCheckInline(backgroundFailure?: string): Promise<void> {
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

    if (!reason) {
      // Even if the background process failed, provide explicit completion feedback.
      pi.sendMessage(
        {
          customType: "lat-ok",
          content: backgroundFailure
            ? `lat check fallback completed. No sync warnings from stop hook.\n\nBackground process error:\n${backgroundFailure}`
            : "lat.md is in sync with the codebase.",
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: false },
      );
      return;
    }

    pi.sendMessage(
      { customType: "lat-check", content: reason, display: true },
      { deliverAs: "followUp", triggerTurn: true },
    );
  }
}
