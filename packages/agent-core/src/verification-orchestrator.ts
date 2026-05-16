import { trace } from "@opentelemetry/api";
import { runVerification } from "./worktree-manager.js";
import { storeVerificationLog, emitEvent } from "./utils.js";
import type { SessionEventCallback } from "./types.js";

const tracer = trace.getTracer("@mbe/agent-core");

export interface VerificationResult {
  passed: boolean;
  logPath?: string;
  error?: string;
}

/**
 * Run lint, typecheck, and tests in the worktree and store the results.
 */
export async function orchestrateVerification(
  worktreePath: string,
  onEvent?: SessionEventCallback
): Promise<VerificationResult> {
  const verifySpan = tracer.startSpan("agent_core.verify_changes");
  try {
    const verification = await runVerification(worktreePath);
    verifySpan.setAttribute("verify.passed", verification.passed);
    verifySpan.setAttribute("verify.lint", verification.lintOk);
    verifySpan.setAttribute("verify.typecheck", verification.typecheckOk);
    verifySpan.setAttribute("verify.tests", verification.testsOk);

    // Store full verification output (not truncated)
    const logSections: { label: string; output: string }[] = [];
    if (verification.lintOutput) logSections.push({ label: "Lint", output: verification.lintOutput });
    if (verification.typecheckOutput) logSections.push({ label: "Typecheck", output: verification.typecheckOutput });
    if (verification.testOutput) logSections.push({ label: "Tests", output: verification.testOutput });

    let verificationLogPath: string | undefined;
    if (logSections.length > 0) {
      verificationLogPath = await storeVerificationLog(worktreePath, logSections);
    }

    emitEvent(onEvent, "session:verification", {
      message: verification.passed
        ? "Verification passed (lint + typecheck + tests)"
        : `Verification failed — lint: ${verification.lintOk ? "OK" : "FAIL"}, typecheck: ${verification.typecheckOk ? "OK" : "FAIL"}, tests: ${verification.testsOk ? "OK" : "FAIL"}${verificationLogPath ? ` (full log: ${verificationLogPath})` : ""}`,
    });

    if (!verification.passed) {
      const parts: string[] = [];
      if (!verification.lintOk) parts.push(`lint: ${verification.lintOutput}`);
      if (!verification.typecheckOk) parts.push(`typecheck: ${verification.typecheckOutput}`);
      if (!verification.testsOk) parts.push(`tests: ${verification.testOutput}`);
      return {
        passed: false,
        logPath: verificationLogPath,
        error: `Verification failed: ${parts.join("; ")}`,
      };
    }

    return { passed: true, logPath: verificationLogPath };
  } finally {
    verifySpan.end();
  }
}
