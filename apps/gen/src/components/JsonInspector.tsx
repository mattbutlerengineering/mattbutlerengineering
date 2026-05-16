import { useRef, useEffect, useCallback, useState, useMemo, type ReactNode } from "react";
import { Button } from "@mattbutlerengineering/rialto";
import styles from "./JsonInspector.module.css";

export interface JsonInspectorProps {
  rawLines: string[];
  isStreaming: boolean;
}

// ---------------------------------------------------------------------------
// Safe React-based syntax highlighting (no innerHTML, no third-party lib)
// ---------------------------------------------------------------------------

/**
 * Wrap occurrences of `search` within `text` in <mark> elements.
 * Returns an array of string and ReactNode fragments.
 */
function wrapMatches(text: string, search: string, keyBase: number): ReactNode[] {
  if (!search) return [text];

  const lower = text.toLowerCase();
  const searchLower = search.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIdx = 0;

  let pos = lower.indexOf(searchLower, cursor);
  while (pos !== -1) {
    if (pos > cursor) {
      parts.push(text.slice(cursor, pos));
    }
    parts.push(
      <mark key={`m${keyBase}-${matchIdx++}`} className={styles.searchMatch}>
        {text.slice(pos, pos + search.length)}
      </mark>
    );
    cursor = pos + search.length;
    pos = lower.indexOf(searchLower, cursor);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

/**
 * Tokenize a pretty-printed JSON string into React elements with span wrappers.
 * Uses regex parsing to classify each token — string values, keys, numbers,
 * booleans, nulls, and structural characters.
 *
 * When `search` is provided, matching substrings are wrapped in <mark>.
 *
 * Safe by construction: builds React elements, never uses innerHTML.
 */
function highlightJson(json: string, search: string): ReactNode[] {
  const TOKEN_REGEX = /("(?:[^"\\]|\\.)*"(?:\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:])/g;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let keyIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(json)) !== null) {
    if (match.index > lastIndex) {
      const gap = json.slice(lastIndex, match.index);
      parts.push(...wrapMatches(gap, search, keyIndex++));
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
        <span key={keyIndex} className={className}>
          {wrapMatches(token, search, keyIndex)}
        </span>
      );
    } else {
      parts.push(...wrapMatches(token, search, keyIndex));
    }
    keyIndex++;

    lastIndex = match.index + token.length;
  }

  if (lastIndex < json.length) {
    parts.push(...wrapMatches(json.slice(lastIndex), search, keyIndex));
  }

  return parts;
}

/**
 * Count case-insensitive occurrences of `search` in `text`.
 */
function countMatches(text: string, search: string): number {
  if (!search) return 0;
  const lower = text.toLowerCase();
  const searchLower = search.toLowerCase();
  let count = 0;
  let pos = lower.indexOf(searchLower);
  while (pos !== -1) {
    count++;
    pos = lower.indexOf(searchLower, pos + search.length);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Right column showing the raw JSONL spec with syntax highlighting.
 * Features: line numbers, search/filter, collapsible blocks, copy feedback.
 * Auto-scrolls during streaming; pauses auto-scroll on manual scroll-up.
 */
export function JsonInspector({ rawLines, isStreaming }: JsonInspectorProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [copied, setCopied] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
    autoScrollRef.current = atBottom;
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [rawLines.length]);

  /** Pretty-printed blocks and cumulative line offsets. */
  const blocks = useMemo(() => {
    const result: { pretty: string; startLine: number; lineCount: number }[] = [];
    rawLines.reduce((runningLine, line) => {
      let pretty: string;
      try {
        pretty = JSON.stringify(JSON.parse(line), null, 2);
      } catch {
        pretty = line;
      }
      const lineCount = pretty.split("\n").length;
      result.push({ pretty, startLine: runningLine, lineCount });
      return runningLine + lineCount;
    }, 1);
    return result;
  }, [rawLines]);

  /** Total search match count across all blocks. */
  const matchCount = useMemo(() => {
    if (!search) return 0;
    return blocks.reduce((sum, b) => sum + countMatches(b.pretty, search), 0);
  }, [blocks, search]);

  function buildFullJson(): string {
    return blocks.map((b) => b.pretty).join("\n\n");
  }

  function handleCopy() {
    void navigator.clipboard.writeText(buildFullJson());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const json = buildFullJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gen-spec-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleCollapsed(index: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <aside className={styles.inspector}>
      <div className={styles.toolbar}>
        <span className={styles.label}>JSON</span>
        <div className={styles.searchGroup}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search JSON"
          />
          {search && (
            <span className={styles.matchCount}>
              {matchCount} {matchCount === 1 ? "match" : "matches"}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={isStreaming || rawLines.length === 0}
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isStreaming || rawLines.length === 0}
          onClick={handleDownload}
        >
          Download
        </Button>
      </div>

      <div
        className={styles.scrollArea}
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {rawLines.length === 0 ? (
          <p className={styles.empty}>No data yet</p>
        ) : (
          blocks.map((block, i) => {
            const isCollapsed = collapsed.has(i);
            const lines = block.pretty.split("\n");
            const firstLine = lines[0] ?? "";
            const truncated =
              firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine;

            return (
              <div key={i} className={styles.block}>
                <button
                  type="button"
                  className={styles.collapseToggle}
                  onClick={() => toggleCollapsed(i)}
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? "Expand block" : "Collapse block"}
                >
                  <span className={styles.arrow}>{isCollapsed ? "\u25B6" : "\u25BC"}</span>
                </button>

                {isCollapsed ? (
                  <div className={styles.collapsedRow}>
                    <span className={styles.lineNumber}>{block.startLine}</span>
                    <pre className={styles.pre}>
                      <code className={styles.collapsedCode}>
                        {highlightJson(truncated, search)}
                        {lines.length > 1 && (
                          <span className={styles.ellipsis}> ...</span>
                        )}
                      </code>
                    </pre>
                  </div>
                ) : (
                  <div className={styles.expandedBlock}>
                    {lines.map((line, li) => (
                      <div key={li} className={styles.lineRow}>
                        <span className={styles.lineNumber}>
                          {block.startLine + li}
                        </span>
                        <pre className={styles.pre}>
                          <code>{highlightJson(line, search)}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
