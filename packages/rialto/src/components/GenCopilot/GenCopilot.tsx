import { forwardRef } from "react";
import type { ComponentRegistry } from "@json-render/react";
import { Drawer } from "../Drawer/Drawer.js";
import { CopilotPreview } from "./CopilotPreview.js";
import { CopilotPromptBar } from "./CopilotPromptBar.js";
import { useGenCopilotStream } from "./useGenCopilotStream.js";
import styles from "./GenCopilot.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * A single data schema describing an entity available to the AI generator.
 */
export interface DomainContextSchema {
  /** Human-readable entity name (e.g. "Reservation") */
  name: string;
  /** Brief description of what the entity represents */
  description: string;
  /** Comma-separated list of available fields (e.g. "id, guestName, tableId") */
  fields: string;
}

/**
 * Domain-specific context passed to the AI generation endpoint.
 * Schemas are serialized into the prompt preamble so the model understands
 * the app's data structures.
 */
export interface DomainContext {
  schemas: DomainContextSchema[];
}

/**
 * Props for GenCopilot.
 *
 * NOTE: There is no `open` prop. GenCopilot is designed for conditional
 * mounting — the consumer renders `{copilotOpen && <GenCopilot ... />}` to
 * control visibility. This guarantees fresh state on every open (no persisted
 * streaming state, spec, or errors from a previous session).
 * The Drawer is always rendered with `open={true}` internally.
 */
export interface GenCopilotProps {
  /** Called when the user closes the panel — consumer should unmount GenCopilot */
  onClose: () => void;
  /** API endpoint for the generation stream (e.g. "/api/gen/ui") */
  api: string;
  /** Domain context schemas serialized into the AI prompt preamble */
  domainContext: DomainContext;
  /**
   * Callback that returns the current auth token (or null if unauthenticated).
   * Accepts a sync or async getter so it works with any auth provider.
   */
  getAccessToken: () => string | null | Promise<string | null>;
  /** Component registry for rendering AI-generated specs (from @json-render/react) */
  registry: ComponentRegistry;
}

/* ── Component ──────────────────────────────── */

/**
 * GenCopilot is a slide-over panel (Drawer) providing AI-powered generative UI
 * inside any Rialto-themed app.
 *
 * Consumers stream JSONL from the provided API endpoint and render the resulting
 * Rialto component tree progressively via the supplied registry.
 *
 * Domain context schemas are serialized and prepended to the user prompt before
 * the POST request is sent, giving the model knowledge of the app's data structures.
 *
 * @example
 * ```tsx
 * {copilotOpen && (
 *   <GenCopilot
 *     onClose={() => setCopilotOpen(false)}
 *     api="/api/gen/ui"
 *     domainContext={HOSPITALITY_DOMAIN_CONTEXT}
 *     getAccessToken={getAccessToken}
 *     registry={registry}
 *   />
 * )}
 * ```
 */
export const GenCopilot = forwardRef<HTMLDivElement, GenCopilotProps>(function GenCopilot(
  { onClose, api, domainContext, getAccessToken, registry },
  ref
) {
  const { spec, isStreaming, error, send, stop } = useGenCopilotStream({
    api,
    domainContext,
    getAccessToken,
  });

  return (
    <Drawer ref={ref} open={true} onClose={onClose} title="Gen Copilot" side="right">
      <div className={styles.body}>
        <CopilotPreview spec={spec} isStreaming={isStreaming} error={error} registry={registry} />
        <CopilotPromptBar onSubmit={send} onStop={stop} isStreaming={isStreaming} />
      </div>
    </Drawer>
  );
});

GenCopilot.displayName = "GenCopilot";
