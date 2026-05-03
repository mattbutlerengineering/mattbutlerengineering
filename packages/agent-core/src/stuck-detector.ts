import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// ── Types ───────────────────────────────────────────────────────────

export type StuckPatternType =
  | "repeated_action_observation"
  | "repeated_error"
  | "self_message_loop"
  | "alternating_pairs"
  | "context_window_loop"
  | "context_window_warning"
  | "zero_progress"
  | "silent_failure_loop";

export type StuckSeverity = "warning" | "error";

export interface StuckPattern {
  readonly type: StuckPatternType;
  readonly count: number;
  readonly threshold: number;
  readonly description: string;
  readonly severity: StuckSeverity;
}

export interface StuckDetectorConfig {
  readonly repeatedActionThreshold: number;
  readonly repeatedErrorThreshold: number;
  readonly selfMessageThreshold: number;
  readonly alternatingPairThreshold: number;
  readonly contextWindowLoopThreshold: number;
  readonly contextWindowWarningThreshold: number;
  readonly zeroProgressThreshold: number;
  readonly zeroProgressMinOutputChars: number;
  readonly silentFailureTurnWindow: number;
}

export interface StuckDetector {
  ingest(message: SDKMessage): StuckPattern | null;
  reset(): void;
}

export const DEFAULT_STUCK_CONFIG: StuckDetectorConfig = {
  repeatedActionThreshold: 4,
  repeatedErrorThreshold: 3,
  selfMessageThreshold: 3,
  alternatingPairThreshold: 3,
  contextWindowLoopThreshold: 5,
  contextWindowWarningThreshold: 2,
  zeroProgressThreshold: 5,
  zeroProgressMinOutputChars: 500,
  silentFailureTurnWindow: 3,
};

// ── Fingerprinting ──────────────────────────────────────────────────

/**
 * Normalize command output by stripping process IDs, timestamps, and
 * other volatile tokens so that two functionally-identical observations
 * compare as equal. Inspired by OpenHands' `_eq_no_pid()`.
 */
function normalizeOutput(text: string): string {
  return text
    .replace(/\bpid\s*[=:]\s*\d+/gi, "pid=X")
    .replace(/\b\d{4,}\b/g, "N")
    .replace(/0x[0-9a-f]+/gi, "0xADDR");
}

function fingerprintToolUse(block: { name: string; input: unknown }): string {
  return `tool:${block.name}:${JSON.stringify(block.input)}`;
}

function fingerprintAssistantText(contentBlocks: Array<{ type: string; text?: string }>): string {
  const texts = contentBlocks.filter((b) => b.type === "text" && b.text).map((b) => b.text!);
  return texts.length > 0 ? `text:${texts.join("\n")}` : "";
}

function extractAssistantTextLength(contentBlocks: Array<{ type: string; text?: string }>): number {
  return contentBlocks
    .filter((b) => b.type === "text" && b.text)
    .reduce((sum, b) => sum + b.text!.length, 0);
}

function extractToolUseFingerprints(message: SDKMessage): readonly string[] {
  if (message.type !== "assistant") return [];

  const content = (
    message as { message: { content: Array<{ type: string; name?: string; input?: unknown }> } }
  ).message.content;

  return content
    .filter((b) => b.type === "tool_use" && b.name && b.input !== undefined)
    .map((b) => fingerprintToolUse(b as { name: string; input: unknown }));
}

function extractToolNames(message: SDKMessage): readonly string[] {
  if (message.type !== "assistant") return [];

  const content = (message as { message: { content: Array<{ type: string; name?: string }> } })
    .message.content;

  return content.filter((b) => b.type === "tool_use" && b.name).map((b) => b.name!);
}

function extractObservationFingerprint(message: SDKMessage): string | null {
  if (message.type !== "user") return null;

  const userMsg = message as {
    tool_use_result?: unknown;
    message: { content: unknown };
  };

  if (userMsg.tool_use_result !== undefined) {
    return `obs:${normalizeOutput(JSON.stringify(userMsg.tool_use_result))}`;
  }

  return `obs:${normalizeOutput(JSON.stringify(userMsg.message.content))}`;
}

function isErrorObservation(message: SDKMessage): boolean {
  if (message.type !== "user") return false;

  const content = JSON.stringify((message as { message: { content: unknown } }).message.content);

  return (
    content.includes("is_error") ||
    content.includes('"error"') ||
    content.includes("Error:") ||
    content.includes("ENOENT") ||
    content.includes("EACCES")
  );
}

/** Check if a tool use is a file-modifying operation */
function isFileModifyingTool(toolName: string): boolean {
  return ["Write", "Edit", "Bash"].includes(toolName);
}

// ── Detector ────────────────────────────────────────────────────────

export function createStuckDetector(configOverrides?: Partial<StuckDetectorConfig>): StuckDetector {
  const config = { ...DEFAULT_STUCK_CONFIG, ...configOverrides };

  // Rolling history windows
  const actionFingerprints: string[] = [];
  const observationFingerprints: string[] = [];
  const textFingerprints: string[] = [];
  let compactCount = 0;
  let turnsSinceLastToolUse = 0;
  let lastTextOutputLength = 0;

  // Context-aware repeat detection: track observation fingerprints at each action
  const observationAtAction: string[] = [];

  // Silent failure loop tracking
  const recentToolNames: string[] = [];
  const recentToolSuccess: boolean[] = [];
  let turnsSinceFileModification = 0;
  let hadFileModifyingTool = false;

  function checkRepeatedActionObservation(): StuckPattern | null {
    const n = config.repeatedActionThreshold;
    if (actionFingerprints.length < n || observationFingerprints.length < n) {
      return null;
    }

    const recentActions = actionFingerprints.slice(-n);
    const recentObs = observationFingerprints.slice(-n);

    const allActionsSame = recentActions.every((a) => a === recentActions[0]);
    const allObsSame = recentObs.every((o) => o === recentObs[0]);

    if (!allActionsSame || !allObsSame) return null;

    // Context-aware: check if observations between repeats changed
    // (indicating the agent fixed something and is legitimately retrying)
    if (observationAtAction.length >= n) {
      const contextObs = observationAtAction.slice(-n);
      const contextChanged = contextObs.some((o, i) => i > 0 && o !== contextObs[0]);
      if (contextChanged) return null;
    }

    return {
      type: "repeated_action_observation",
      count: n,
      threshold: n,
      description: `Same action produced same observation ${n} times in a row`,
      severity: "error",
    };
  }

  function checkSelfMessageLoop(): StuckPattern | null {
    const n = config.selfMessageThreshold;
    if (textFingerprints.length < n) return null;

    const recent = textFingerprints.slice(-n);
    const allSame = recent.every((t) => t === recent[0]);

    if (allSame && recent[0] !== "") {
      return {
        type: "self_message_loop",
        count: n,
        threshold: n,
        description: `Agent sent the same text message ${n} times in a row`,
        severity: "error",
      };
    }
    return null;
  }

  function checkAlternatingPairs(): StuckPattern | null {
    const n = config.alternatingPairThreshold;
    const needed = n * 2;
    if (actionFingerprints.length < needed) return null;

    const recent = actionFingerprints.slice(-needed);
    const a = recent[0];
    const b = recent[1];

    if (a === b) return null; // Not alternating if they're the same

    const isAlternating = recent.every((fp, i) => fp === (i % 2 === 0 ? a : b));

    if (isAlternating) {
      return {
        type: "alternating_pairs",
        count: n,
        threshold: n,
        description: `Two actions alternating ${n} times (A,B,A,B pattern)`,
        severity: "error",
      };
    }
    return null;
  }

  function checkContextWindowLoop(): StuckPattern | null {
    if (compactCount >= config.contextWindowLoopThreshold) {
      return {
        type: "context_window_loop",
        count: compactCount,
        threshold: config.contextWindowLoopThreshold,
        description: `Context window compacted ${compactCount} times — agent is thrashing`,
        severity: "error",
      };
    }

    if (compactCount >= config.contextWindowWarningThreshold) {
      return {
        type: "context_window_warning",
        count: compactCount,
        threshold: config.contextWindowWarningThreshold,
        description: `Context window compacted ${compactCount} times — approaching thrash limit`,
        severity: "warning",
      };
    }

    return null;
  }

  function checkZeroProgress(): StuckPattern | null {
    if (turnsSinceLastToolUse >= config.zeroProgressThreshold) {
      // Exception: if the last text output was substantial (genuine reasoning)
      if (lastTextOutputLength >= config.zeroProgressMinOutputChars) {
        return null;
      }

      return {
        type: "zero_progress",
        count: turnsSinceLastToolUse,
        threshold: config.zeroProgressThreshold,
        description: `No tool use in ${turnsSinceLastToolUse} consecutive turns`,
        severity: "error",
      };
    }
    return null;
  }

  function checkSilentFailureLoop(): StuckPattern | null {
    const window = config.silentFailureTurnWindow;
    if (!hadFileModifyingTool) return null;
    if (recentToolSuccess.length < window) return null;

    const recentSuccesses = recentToolSuccess.slice(-window);
    const allSucceeded = recentSuccesses.every((s) => s);

    if (allSucceeded && turnsSinceFileModification >= window) {
      return {
        type: "silent_failure_loop",
        count: turnsSinceFileModification,
        threshold: window,
        description: `Tool calls succeed but no file modifications in ${turnsSinceFileModification} turns — possible silent failure`,
        severity: "warning",
      };
    }
    return null;
  }

  // Track consecutive errors separately
  const errorActions: string[] = [];

  function checkRepeatedErrors(): StuckPattern | null {
    const n = config.repeatedErrorThreshold;
    if (errorActions.length < n) return null;

    const recent = errorActions.slice(-n);
    const allSame = recent.every((a) => a === recent[0]);

    if (allSame) {
      return {
        type: "repeated_error",
        count: n,
        threshold: n,
        description: `Same action produced errors ${n} times in a row`,
        severity: "error",
      };
    }
    return null;
  }

  return {
    ingest(message: SDKMessage): StuckPattern | null {
      // Handle compact boundary messages
      if (
        message.type === "system" &&
        "subtype" in message &&
        message.subtype === "compact_boundary"
      ) {
        compactCount++;
        return checkContextWindowLoop();
      }

      // Handle assistant messages
      if (message.type === "assistant") {
        const toolUses = extractToolUseFingerprints(message);
        const toolNames = extractToolNames(message);

        if (toolUses.length > 0) {
          // Agent used tools — record action fingerprints
          for (const fp of toolUses) {
            actionFingerprints.push(fp);
          }
          for (const name of toolNames) {
            recentToolNames.push(name);
            if (isFileModifyingTool(name)) {
              hadFileModifyingTool = true;
            }
          }
          turnsSinceLastToolUse = 0;
        } else {
          // Agent sent text only — check for self-message loop
          const content = (
            message as {
              message: { content: Array<{ type: string; text?: string }> };
            }
          ).message.content;
          const textFp = fingerprintAssistantText(content);
          lastTextOutputLength = extractAssistantTextLength(content);
          textFingerprints.push(textFp);
          turnsSinceLastToolUse++;

          const selfLoop = checkSelfMessageLoop();
          if (selfLoop) return selfLoop;

          return checkZeroProgress();
        }
      }

      // Handle user messages (tool results / observations)
      if (message.type === "user") {
        const obsFp = extractObservationFingerprint(message);
        if (obsFp) {
          observationFingerprints.push(obsFp);
          observationAtAction.push(obsFp);
        }

        const isError = isErrorObservation(message);

        // Track error observations
        if (isError && actionFingerprints.length > 0) {
          errorActions.push(actionFingerprints[actionFingerprints.length - 1]);
        } else {
          // Reset consecutive error tracking on non-error observation
          errorActions.length = 0;
        }

        // Track silent failure loop state
        recentToolSuccess.push(!isError);
        if (!isError) {
          // Check if the last tool was file-modifying
          const lastToolName =
            recentToolNames.length > 0 ? recentToolNames[recentToolNames.length - 1] : null;
          if (lastToolName && isFileModifyingTool(lastToolName)) {
            turnsSinceFileModification = 0;
          } else {
            turnsSinceFileModification++;
          }
        } else {
          turnsSinceFileModification++;
        }

        // Run detection checks after receiving an observation
        const repeatedAO = checkRepeatedActionObservation();
        if (repeatedAO) return repeatedAO;

        const repeatedErr = checkRepeatedErrors();
        if (repeatedErr) return repeatedErr;

        const alternating = checkAlternatingPairs();
        if (alternating) return alternating;

        const silentFailure = checkSilentFailureLoop();
        if (silentFailure) return silentFailure;
      }

      return null;
    },

    reset(): void {
      actionFingerprints.length = 0;
      observationFingerprints.length = 0;
      textFingerprints.length = 0;
      errorActions.length = 0;
      observationAtAction.length = 0;
      recentToolNames.length = 0;
      recentToolSuccess.length = 0;
      compactCount = 0;
      turnsSinceLastToolUse = 0;
      lastTextOutputLength = 0;
      turnsSinceFileModification = 0;
      hadFileModifyingTool = false;
    },
  };
}
