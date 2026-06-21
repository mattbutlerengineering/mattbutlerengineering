#!/usr/bin/env node
// PostToolUse hook: compress large Bash tool output to save context tokens.
//
// When a Bash tool output exceeds OUTPUT_GATE characters, this hook injects
// a compressed summary as additionalContext. The compression uses local
// heuristics only — no LLM calls, no external dependencies.
//
// Compression strategy:
//   1. Strip ANSI escape codes (visual noise, not semantic content)
//   2. Deduplicate consecutive repeated lines (common in build/test output)
//   3. Tail-truncate with a summary note (keep last N chars of meaningful content)
//
// Code blocks (``` fenced) are never compressed — they are preserved exactly.
//
// Fail-open: any error exits 0 and emits nothing, so the pipeline is never blocked.

const OUTPUT_GATE = 5000; // compress when tool output exceeds this many chars
const KEEP_CHARS = 3000; // keep last N chars after truncation

// ─── Compression helpers ──────────────────────────────────────────────────────

/** Remove ANSI escape sequences from text. */
function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Collapse consecutive identical lines into a single line with a count.
 * Skips over fenced code block regions.
 */
function deduplicateLines(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  let inCode = false;

  while (i < lines.length) {
    const line = lines[i];

    // Track fenced code block entry/exit
    if (line.trimStart().startsWith("```")) {
      inCode = !inCode;
      out.push(line);
      i++;
      continue;
    }

    // Inside code blocks, never deduplicate
    if (inCode) {
      out.push(line);
      i++;
      continue;
    }

    // Count consecutive identical lines
    let count = 1;
    while (i + count < lines.length && lines[i + count] === line) {
      count++;
    }

    if (count > 2) {
      out.push(line);
      out.push(`[... repeated ${count - 1} more times ...]`);
    } else {
      for (let k = 0; k < count; k++) {
        out.push(line);
      }
    }

    i += count;
  }

  return out.join("\n");
}

/**
 * Truncate text keeping last KEEP_CHARS characters.
 * Returns truncated text with a header note, or original if short enough.
 */
function truncate(text, originalLen) {
  if (text.length <= KEEP_CHARS) {
    return `[Output compressed: ${originalLen} chars → ${text.length} chars (showing full deduped content)]\n${text}`;
  }
  const tail = text.slice(-KEEP_CHARS);
  return (
    `[Output truncated: ${originalLen} chars → showing last ${KEEP_CHARS} chars]\n` +
    `[... ${text.length - KEEP_CHARS} chars omitted ...]\n` +
    tail
  );
}

/** Full compression pipeline. Returns compressed string. */
function compress(raw) {
  const stripped = stripAnsi(raw);
  const deduped = deduplicateLines(stripped);
  return truncate(deduped, raw.length);
}

// ─── Main hook body ───────────────────────────────────────────────────────────

let input = "";
const stdinTimeout = setTimeout(() => process.exit(0), 10000);

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  clearTimeout(stdinTimeout);
  try {
    if (!input.trim()) {
      process.exit(0);
    }

    const data = JSON.parse(input);

    // Extract output from the tool response
    const toolResponse = data.tool_response;
    if (!toolResponse) {
      process.exit(0);
    }

    const output =
      typeof toolResponse === "string"
        ? toolResponse
        : typeof toolResponse.output === "string"
          ? toolResponse.output
          : null;

    if (!output || output.length <= OUTPUT_GATE) {
      process.exit(0);
    }

    const compressed = compress(output);

    const result = {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: compressed,
      },
    };

    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (_e) {
    // Fail-open: never block the pipeline
    process.exit(0);
  }
});
