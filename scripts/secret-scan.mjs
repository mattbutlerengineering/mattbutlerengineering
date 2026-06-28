/**
 * secret-scan.mjs — high-confidence hardcoded-secret detection.
 *
 * Shifts the CI Gitleaks scan left to edit time: the companion PreToolUse hook
 * (`.claude/hooks/secret-scan.mjs`) feeds the content an agent is about to write
 * into {@link scanForSecrets} and blocks the edit on a hit, so a planted live
 * key is caught before it ever reaches a commit.
 *
 * Design: pure detection here (fully unit-tested, no I/O); the hook is a thin
 * stdin → exit-code wrapper. Patterns are intentionally **high-confidence /
 * low-false-positive** so the hook never deadlocks normal editing — test-mode
 * keys, examples, and fixtures are deliberately not flagged.
 */

/**
 * High-confidence secret signatures. Each entry is `{ type, re }`; the first
 * matching pattern wins. Keep these specific — a false positive blocks a real
 * edit, which is worse than a CI catch.
 */
export const SECRET_PATTERNS = [
  // Stripe live keys (test-mode sk_test_/pk_test_ are intentionally excluded).
  { type: "Stripe live secret key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
  { type: "Stripe live publishable key", re: /\bpk_live_[A-Za-z0-9]{16,}\b/ },
  // AWS access key id (long-term AKIA / temporary ASIA).
  { type: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  // JSON Web Token — header.payload.signature, both segments starting `eyJ`.
  {
    type: "JSON Web Token (JWT)",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  // PEM private key block header (RSA/EC/OpenSSH/DSA/PGP/plain).
  { type: "PEM private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
];

/**
 * Paths where credential-shaped strings are expected and must NOT block:
 * env examples/samples, test files, fixtures, and Markdown docs.
 */
const ALLOWLIST_RE =
  /(?:\.example(?:$|[./])|\.sample(?:$|[./])|__tests__\/|\.test\.|\.spec\.|\/fixtures?\/|^fixtures?\/|\/test\/|^test\/|\.md$)/;

/**
 * Scan `content` for a high-confidence hardcoded secret.
 *
 * @param {unknown} content - the text about to be written
 * @param {string} [filePath] - destination path (used for allowlisting)
 * @returns {{ matched: boolean, type: string | null }}
 */
export function scanForSecrets(content, filePath = "") {
  if (typeof content !== "string" || content.length === 0) {
    return { matched: false, type: null };
  }
  if (typeof filePath === "string" && filePath && ALLOWLIST_RE.test(filePath)) {
    return { matched: false, type: null };
  }
  for (const { type, re } of SECRET_PATTERNS) {
    if (re.test(content)) {
      return { matched: true, type };
    }
  }
  return { matched: false, type: null };
}
