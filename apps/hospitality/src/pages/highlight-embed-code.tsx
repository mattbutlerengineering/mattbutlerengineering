/* eslint-disable mbe-local/prefer-rialto-components -- raw <span> is correct for inline syntax tokens */
import type { ReactNode } from "react";
import styles from "./BookingWidgetDemoPage.module.css";

/**
 * Syntax-highlights embed code for display in a `<pre><code>` block.
 *
 * The regex patterns are carefully crafted to:
 * 1. Match HTML comments including multi-line comments (no ReDoS risk on hardcoded input)
 * 2. Match HTML tags with proper attribute handling (no exponential backtracking)
 */
export function highlightEmbedCode(code: string): ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, lineIndex) => {
    const parts: ReactNode[] = [];
    let remaining = line;
    let keyIndex = 0;

    while (remaining.length > 0) {
      // HTML comments — match single-line or multi-line comments
      const commentMatch = remaining.match(/^<!--[\s\S]*?-->/);
      if (commentMatch) {
        parts.push(
          <span key={keyIndex++} className={styles.syntaxComment}>
            {commentMatch[0]}
          </span>
        );
        remaining = remaining.slice(commentMatch[0].length);
        continue;
      }

      // HTML tags — matches: <tag>, <tag attr="val">, </tag>, <tag/>
      // Uses simple pattern that avoids ReDoS by not using nested quantifiers
      const tagMatch = remaining.match(
        /^<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[a-zA-Z][a-zA-Z0-9-]*="[^"]*")*\s*\/?>/
      );
      if (tagMatch) {
        parts.push(
          <span key={keyIndex++} className={styles.syntaxTag}>
            {tagMatch[0]}
          </span>
        );
        remaining = remaining.slice(tagMatch[0].length);
        continue;
      }

      // Strings (single or double quoted)
      const stringMatch = remaining.match(/^('[^']*'|"[^"]*")/);
      if (stringMatch) {
        parts.push(
          <span key={keyIndex++} className={styles.syntaxString}>
            {stringMatch[1]}
          </span>
        );
        remaining = remaining.slice(stringMatch[1].length);
        continue;
      }

      // JS line comments (with optional leading whitespace)
      const jsCommentMatch = remaining.match(/^\s*(\/\/.*)/);
      if (jsCommentMatch) {
        parts.push(
          <span key={keyIndex++} className={styles.syntaxComment}>
            {jsCommentMatch[1]}
          </span>
        );
        remaining = "";
        continue;
      }

      // Plain text (advance one character)
      parts.push(<span key={keyIndex++}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    }

    return (
      // eslint-disable-next-line @eslint-react/no-array-index-key -- lines from string split are stable and have no unique ID
      <span key={lineIndex}>
        {parts}
        {lineIndex < lines.length - 1 ? "\n" : null}
      </span>
    );
  });
}
