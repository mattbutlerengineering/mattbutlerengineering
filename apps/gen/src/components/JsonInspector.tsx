import { useRef, useEffect, useCallback, type ReactNode } from "react";
import { Button } from "@mbe/rialto";
import styles from "./JsonInspector.module.css";

function downloadJson(content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `spec-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface JsonInspectorProps {
  rawLines: string[];
  isStreaming: boolean;
}

// ---------------------------------------------------------------------------
// Safe React-based syntax highlighting (no innerHTML, no third-party lib)
// ---------------------------------------------------------------------------

/**
 * Tokenize a pretty-printed JSON string into React elements with span wrappers.
 * Uses regex parsing to classify each token — string values, keys, numbers,
 * booleans, nulls, and structural characters.
 *
 * Safe by construction: builds React elements, never uses innerHTML.
 */
function highlightJson(json: string): ReactNode[] {
  // Captures: quoted strings (with optional colon = key), numbers, literals, structure
  const TOKEN_REGEX = /("(?:[^"\\]|\\.)*"(?:\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:])/g;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let keyIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(json)) !== null) {
    // Preserve whitespace/newlines between tokens as plain text
    if (match.index > lastIndex) {
      parts.push(json.slice(lastIndex, match.index));
    }

    const token = match[0];
    let className: string | undefined;

    if (token.endsWith(":")) {
      className = styles.jsonKey;
    } else if (token.startsWith('"')) {
      className = styles.jsonString;
    } else if (token === "true" || token === "false") {
      className = styles.jsonBoolean;
    } else if (token === "null") {
      className = styles.jsonNull;
    } else if (/^-?\d/.test(token)) {
      className = styles.jsonNumber;
    }

    if (className) {
      parts.push(
        <span key={keyIndex++} className={className}>
          {token}
        </span>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < json.length) {
    parts.push(json.slice(lastIndex));
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Right column showing the raw JSONL spec with syntax highlighting.
 * Auto-scrolls during streaming; pauses auto-scroll on manual scroll-up.
 */
export function JsonInspector({ rawLines, isStreaming }: JsonInspectorProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Ref (not state) to avoid re-renders on scroll position changes
  const autoScrollRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
    autoScrollRef.current = atBottom;
  }, []);

  // Scroll to bottom when new lines arrive, if auto-scroll is enabled
  useEffect(() => {
    if (autoScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [rawLines.length]);

  function buildFullJson(): string {
    return rawLines
      .map((line) => {
        try {
          return JSON.stringify(JSON.parse(line), null, 2);
        } catch {
          return line;
        }
      })
      .join("\n\n");
  }

  function handleCopy() {
    void navigator.clipboard.writeText(buildFullJson());
  }

  function handleDownload() {
    downloadJson(buildFullJson());
  }

  return (
    <aside className={styles.inspector}>
      <div className={styles.toolbar}>
        <span className={styles.label}>JSON</span>
        <div className={styles.toolbarActions}>
          <Button
            variant="ghost"
            size="sm"
            disabled={isStreaming || rawLines.length === 0}
            onClick={handleDownload}
          >
            Download
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isStreaming || rawLines.length === 0}
            onClick={handleCopy}
          >
            Copy
          </Button>
        </div>
      </div>

      <div
        className={styles.scrollArea}
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {rawLines.length === 0 ? (
          <p className={styles.empty}>No data yet</p>
        ) : (
          rawLines.map((line, i) => {
            let pretty: string;
            try {
              pretty = JSON.stringify(JSON.parse(line), null, 2);
            } catch {
              pretty = line;
            }

            return (
              <pre key={i} className={styles.pre}>
                <code>{highlightJson(pretty)}</code>
              </pre>
            );
          })
        )}
      </div>
    </aside>
  );
}
