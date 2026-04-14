import { useState, useEffect, useCallback, useMemo } from "react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { registry } from "@mbe/rialto-catalog";
import { Alert, Button, Divider, Text, SegmentedControl, useToast } from "@mattbutlerengineering/rialto";
import styles from "./PreviewPane.module.css";

const VIEWPORT_SEGMENTS = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "mobile", label: "Mobile" },
] as const;

const VIEWPORT_WIDTHS = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
} as const;

interface SpecStats {
  elementCount: number;
  componentTypes: string[];
}

function computeSpecStats(spec: Spec | null): SpecStats | null {
  if (!spec) return null;

  const types = new Set<string>();
  let count = 0;

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.type === "string") {
      count++;
      types.add(obj.type);
    }
    if (Array.isArray(obj.children)) {
      for (const child of obj.children) {
        walk(child);
      }
    }
  }

  walk(spec);
  return { elementCount: count, componentTypes: Array.from(types).sort() };
}

const PROMPT_SUGGESTIONS = [
  {
    icon: "🎨",
    title: "Dashboard",
    description: "Analytics dashboard with charts and KPIs",
    prompt: "Analytics dashboard with charts and KPIs",
  },
  {
    icon: "📋",
    title: "Form",
    description: "Multi-step registration form with validation",
    prompt: "Multi-step registration form with validation",
  },
  {
    icon: "🛒",
    title: "E-commerce",
    description: "Product card grid with filters and cart",
    prompt: "Product card grid with filters and cart",
  },
  {
    icon: "💬",
    title: "Chat",
    description: "Real-time messaging interface with threads",
    prompt: "Real-time messaging interface with threads",
  },
  {
    icon: "📊",
    title: "Data Table",
    description: "Sortable, filterable data table with pagination",
    prompt: "Sortable, filterable data table with pagination",
  },
  {
    icon: "🗺️",
    title: "Landing Page",
    description: "SaaS landing page with hero and features",
    prompt: "SaaS landing page with hero and features",
  },
] as const;

export interface PreviewPaneProps {
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Set when viewing a saved spec — enables Share and Refine buttons. */
  activeSpecId: string | null;
  /** Called with spec ID when user clicks Share — copies permalink to clipboard. */
  onShare: (id: string) => void;
  /** Called when user clicks Refine — enters refinement mode. */
  onRefine: () => void;
  /** Whether refinement mode is currently active. */
  isRefinementMode: boolean;
  /** Called when user clicks a prompt suggestion card. */
  onSuggestionClick?: (prompt: string) => void;
  /** Whether the preview is in fullscreen mode. */
  isFullscreen?: boolean;
  /** Called to toggle fullscreen mode. */
  onToggleFullscreen?: () => void;
}

/**
 * Center column that renders the AI-generated UI spec.
 * Wraps Renderer in JSONUIProvider with the Rialto catalog registry.
 * Shows loading pulse on TTFT, error alert, or empty state placeholder.
 * When a saved spec is active (activeSpecId set), shows Share + Refine controls.
 */
export function PreviewPane({
  spec,
  isStreaming,
  error,
  onRetry,
  activeSpecId,
  onShare,
  onRefine,
  isRefinementMode,
  onSuggestionClick,
  isFullscreen = false,
  onToggleFullscreen,
}: PreviewPaneProps) {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const specStats = useMemo(() => computeSpecStats(spec), [spec]);

  function handleShare(id: string) {
    const url = `${window.location.origin}/gen/s/${id}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedId(id);
        toast({ title: "Link copied!", variant: "success", duration: 2000 });
        setTimeout(() => setCopiedId(null), 2000);
      },
      () => {
        // Clipboard API unavailable — fall back to prompt
        window.prompt("Copy this link:", url);
      }
    );
    onShare(id);
  }

  function handleDownload() {
    if (!spec) return;
    const json = JSON.stringify(spec, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gen-spec-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyJson() {
    if (!spec) return;
    const json = JSON.stringify(spec, null, 2);
    navigator.clipboard.writeText(json).then(
      () => {
        setCopiedJson(true);
        toast({ title: "JSON copied to clipboard", variant: "success", duration: 2000 });
        setTimeout(() => setCopiedJson(false), 2000);
      },
      () => {
        window.prompt("Copy this JSON:", json);
      }
    );
  }

  const showActionBar = activeSpecId !== null && !isStreaming;

  const handleEscapeKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullscreen && onToggleFullscreen) {
        onToggleFullscreen();
      }
    },
    [isFullscreen, onToggleFullscreen]
  );

  useEffect(() => {
    if (!isFullscreen) return;
    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [isFullscreen, handleEscapeKey]);

  return (
    <section className={styles.pane}>
      {showActionBar ? (
        <div className={styles.actionBar}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleShare(activeSpecId)}
          >
            {copiedId === activeSpecId ? "Copied!" : "Share"}
          </Button>
          {isRefinementMode ? (
            <Text variant="label" color="secondary">
              Refining...
            </Text>
          ) : (
            <Button variant="ghost" size="sm" onClick={onRefine}>
              Refine
            </Button>
          )}
          <Divider orientation="vertical" />
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            Download JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyJson}>
            {copiedJson ? "Copied!" : "Copy JSON"}
          </Button>
          {specStats && (
            <span
              className={styles.specStats}
              title={
                specStats.componentTypes.length > 3
                  ? specStats.componentTypes.join(", ")
                  : undefined
              }
            >
              <Text variant="caption" color="tertiary">
                {specStats.elementCount} elements
                {" \u00b7 "}
                {specStats.componentTypes.length <= 3
                  ? specStats.componentTypes.join(", ")
                  : `${specStats.componentTypes.length} types`}
              </Text>
            </span>
          )}
          {onToggleFullscreen && (
            <span className={styles.actionBarEnd}>
              <Button variant="ghost" size="sm" onClick={onToggleFullscreen}>
                {isFullscreen ? "Collapse" : "Expand"}
              </Button>
            </span>
          )}
        </div>
      ) : (spec || isStreaming) && onToggleFullscreen ? (
        <div className={styles.fullscreenToggle}>
          <Button variant="ghost" size="sm" onClick={onToggleFullscreen}>
            {isFullscreen ? "Collapse" : "Expand"}
          </Button>
        </div>
      ) : null}
      {(spec || isStreaming) && (
        <div className={styles.viewportBar}>
          <SegmentedControl
            segments={[...VIEWPORT_SEGMENTS]}
            value={viewport}
            onChange={(id) => setViewport(id as "desktop" | "tablet" | "mobile")}
            size="sm"
          />
        </div>
      )}
      <JSONUIProvider registry={registry}>
        {error ? (
          <div className={styles.errorState}>
            <Alert variant="error">
              <span>{error.message}</span>
            </Alert>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : isStreaming && !spec ? (
          <div className={styles.loadingState}>
            <div className={styles.pulse} aria-label="Generating…" role="status" />
          </div>
        ) : !spec && !isStreaming ? (
          <div className={styles.welcomeState}>
            <div className={styles.welcomeContent}>
              <Text variant="display" className={styles.welcomeHeading}>
                What would you like to build?
              </Text>
              <Text variant="body" className={styles.welcomeSubtitle}>
                Describe a UI component or layout and watch it come to life
              </Text>
              <div className={styles.suggestionsGrid}>
                {PROMPT_SUGGESTIONS.map((suggestion, index) => (
                  <button
                    key={suggestion.title}
                    type="button"
                    className={styles.suggestionCard}
                    style={{ animationDelay: `${index * 80}ms` }}
                    onClick={() => onSuggestionClick?.(suggestion.prompt)}
                  >
                    <span className={styles.suggestionIcon}>{suggestion.icon}</span>
                    <Text variant="label" className={styles.suggestionTitle}>
                      {suggestion.title}
                    </Text>
                    <Text variant="body" className={styles.suggestionDescription}>
                      {suggestion.description}
                    </Text>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.rendererWrapper}>
            <div
              className={styles.viewportFrame}
              style={{ maxInlineSize: VIEWPORT_WIDTHS[viewport] }}
            >
              <Renderer spec={spec} registry={registry} loading={isStreaming} />
            </div>
          </div>
        )}
      </JSONUIProvider>
    </section>
  );
}
