export const TARGET_ENV = "BASE_URL";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The origin the conformance suite runs against. There is deliberately no default:
 * a local stand-in would let the suite pass against something that is not the edge.
 */
export function resolveTarget(env: Env): string {
  const raw = env[TARGET_ENV]?.trim();
  if (!raw) {
    throw new Error(
      `${TARGET_ENV} is required: the conformance suite needs a target (a wrangler dev edge, ` +
        `a preview, or the deployed site). There is no default and no local stand-in. ` +
        `Example: ${TARGET_ENV}=http://localhost:8787 pnpm test:conformance`
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${TARGET_ENV} must be an absolute http(s) URL, got "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${TARGET_ENV} must be an http(s) URL, got "${raw}"`);
  }
  return url.origin;
}

export interface SessionConfig {
  readonly authority: string;
  readonly clientId: string;
}

/**
 * The OIDC authority and client id the target's hospitality build was built with.
 * The stand-in session is stored under `oidc.user:<authority>:<clientId>`, so the
 * values must match the build. Absent means signed-in specs cannot run: NOT RUN.
 */
export function resolveSession(env: Env): SessionConfig | null {
  const authority = env["HARNESS_AUTH_AUTHORITY"]?.trim();
  const clientId = env["HARNESS_AUTH_CLIENT_ID"]?.trim();
  return authority && clientId ? { authority, clientId } : null;
}
