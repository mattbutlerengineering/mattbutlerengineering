/* eslint-disable mbe-local/prefer-rialto-components -- raw <span> is correct for inline syntax tokens */
import type { ReactNode } from "react";
import styles from "./BookingWidgetDemoPage.module.css";

/**
 * Syntax-highlights embed code for display in a `<pre><code>` block.
 *
 * The regex for HTML tags explicitly matches tag-name + attribute pairs
 * rather than using a generic `[^>]*` pattern, which avoids the CodeQL
 * `js/bad-tag-filter` alert.
 */
export function highlightEmbedCode(code: string): ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, lineIndex) => {
    const parts: ReactNode[] = [];
    let remaining = line;
    let keyIndex = 0;

    while (remaining.length > 0) {
      // HTML comments (input is a hardcoded embed template, not user data)
      // lgtm[js/bad-tag-filter]
      const commentMatch = remaining.match(/^(<!--.*?-->)/);
      if (commentMatch) {
        parts.push(
          <span key={keyIndex++} className={styles.syntaxComment}>
            {commentMatch[1]}
          </span>
        );
        remaining = remaining.slice(commentMatch[1].length);
        continue;
      }

      // HTML tags — match tag name + optional attributes (name="value" pairs)
      // Input is a hardcoded embed template, not user data
      // lgtm[js/redos]
      const tagMatch = remaining.match(
        /^(<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[a-zA-Z][a-zA-Z0-9-]*(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>)/
      );
      if (tagMatch) {
        parts.push(
          <span key={keyIndex++} className={styles.syntaxTag}>
            {tagMatch[1]}
          </span>
        );
        remaining = remaining.slice(tagMatch[1].length);
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

      // JS line comments
      const jsCommentMatch = remaining.match(/^(\/\/.*)/);
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
      <span key={lineIndex}>
        {parts}
        {lineIndex < lines.length - 1 ? "\n" : null}
      </span>
    );
  });
}
