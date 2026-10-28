import { useState, useEffect, useCallback, useMemo } from "react";
import type { Spec } from "@json-render/react";
import { specHasVisibleContent } from "../lib/visible-content.js";
import {
  Alert,
  Button,
  Divider,
  Text,
  SegmentedControl,
  useToast,
} from "@mattbutlerengineering/rialto";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard.js";
import { downloadJson } from "../utils/downloadJson.js";
import { specStats as computeSpecStats } from "../lib/spec.js";
import { SpecProvider, SpecRenderer } from "./SpecRenderer.js";
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

const PROMPT_SUGGESTIONS = [
  {
    icon: "🎨",
    title: "Dashboard",
    description: "Analytics dashboard with a revenue BarChart and KPIs",
    prompt:
      "Analytics dashboard with KPI stats and a BarChart of monthly revenue (Jan through Jun), not a paragraph of numbers",
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
  /** Spec key of the node picked in select mode; owned by the parent so later features can read it. */
  selectedKey?: string | null;
  /** Spec key of the subtree a refinement just changed; outlined briefly in select mode. */
  changedKey?: string | null;
  /** Called with the picked node's spec key, or null when the selection is cleared. */
  onSelectNode?: (key: string | null) => void;
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
  selectedKey = null,
  changedKey = null,
  onSelectNode,
}: PreviewPaneProps) {
  const { toast } = useToast();
  const { copied: copiedLink, copy: copyLink } = useCopyToClipboard();
  const { copied: copiedJson, copy: copyJson } = useCopyToClipboard();
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [selectMode, setSelectMode] = useState(false);
  // Selection is disabled while streaming; the spec is still changing under the cursor.
  const selectable = selectMode && !isStreaming;
  const specStats = useMemo(() => computeSpecStats(spec), [spec]);

  function handleShare(id: string) {
    const url = `${window.location.origin}/gen/s/${id}`;
    void copyLink(url);
    toast({ title: "Link copied!", variant: "success", duration: 2000 });
    onShare(id);
  }

  function handleDownload() {
    if (!spec) return;
    downloadJson(spec);
  }

  function handleCopyJson() {
    if (!spec) return;
    void copyJson(JSON.stringify(spec, null, 2));
    toast({ title: "JSON copied to clipboard", variant: "success", duration: 2000 });
  }

  const showActionBar = activeSpecId !== null && !isStreaming;

  const handleEscapeKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullscreen && onToggleFullscreen) {
        // Claim the key so the global Esc→stop shortcut does not also fire.
        event.preventDefault();
        onToggleFullscreen();
      }
    },
    [isFullscreen, onToggleFullscreen]
  );

  useEffect(() => {
    if (!isFullscreen) return;
    // Capture phase: runs before the global shortcut listener registered at mount.
    document.addEventListener("keydown", handleEscapeKey, true);
    return () => document.removeEventListener("keydown", handleEscapeKey, true);
  }, [isFullscreen, handleEscapeKey]);

  return (
    <section className={styles.pane}>
      {showActionBar ? (
        <div className={styles.actionBar}>
          <Button variant="ghost" size="sm" onClick={() => handleShare(activeSpecId)}>
            {copiedLink ? "Copied!" : "Share"}
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
            <Text
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
            </Text>
          )}
          {onToggleFullscreen && (
            <Text className={styles.actionBarEnd}>
              <Button variant="ghost" size="sm" onClick={onToggleFullscreen}>
                {isFullscreen ? "Collapse" : "Expand"}
              </Button>
            </Text>
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
          {onSelectNode && (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={selectable}
              disabled={isStreaming}
              onClick={() => {
                if (selectMode) onSelectNode(null);
                setSelectMode(!selectMode);
              }}
            >
              Select component
            </Button>
          )}
        </div>
      )}
      <SpecProvider>
        {error ? (
          <div className={styles.errorState}>
            <Alert variant="error">
              <Text>{error.message}</Text>
            </Alert>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry with error context
            </Button>
          </div>
        ) : null}
        {error && !spec ? null : isStreaming && !spec ? (
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
                  <Button
                    key={suggestion.title}
                    type="button"
                    className={styles.suggestionCard}
                    style={{ animationDelay: `${index * 80}ms` }}
                    onClick={() => onSuggestionClick?.(suggestion.prompt)}
                  >
                    <Text className={styles.suggestionIcon}>{suggestion.icon}</Text>
                    <Text variant="label" className={styles.suggestionTitle}>
                      {suggestion.title}
                    </Text>
                    <Text variant="body" className={styles.suggestionDescription}>
                      {suggestion.description}
                    </Text>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : spec && !isStreaming && !specHasVisibleContent(spec) ? (
          <div className={styles.emptyResult} role="status">
            <Text variant="body">
              Nothing visible was generated. This spec is only layout — empty stacks, with no text,
              controls, or pictures. Ask for those pieces, or try the prompt again.
            </Text>
          </div>
        ) : (
          <div className={styles.rendererWrapper}>
            <div
              className={styles.viewportFrame}
              style={{ maxInlineSize: VIEWPORT_WIDTHS[viewport] }}
            >
              <SpecRenderer
                spec={spec}
                loading={isStreaming}
                selectable={selectable}
                selectedKey={selectedKey}
                changedKey={changedKey}
                onSelect={onSelectNode}
                selectableClassName={styles.selectable}
              />
            </div>
          </div>
        )}
      </SpecProvider>
    </section>
  );
}
