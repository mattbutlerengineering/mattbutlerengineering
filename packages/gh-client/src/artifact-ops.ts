import { apiRequest } from "./rest-http.js";
import type { RestContext } from "./rest-http.js";
import { resolveToken } from "./rest-args.js";
import { resolveRepoSlug } from "./repo-resolver.js";
import { defaultSyncHttp, defaultSyncBinaryHttp } from "./sync-http.js";
import type { SyncHttp, SyncBinaryHttp } from "./sync-http.js";

/**
 * GitHub's artifact-download endpoints have no `gh`-CLI-shaped equivalent
 * (`gh run download` writes straight to disk, not the `(cmd,args) -> string`
 * JSON shape the rest of this package wraps), and one of them returns a
 * binary zip, not JSON — outside `client.ts`'s facet model entirely. This
 * module talks to those two endpoints directly over REST, always, whether
 * or not the `gh` binary is on PATH (see #4236 — the flakyTests sensor's
 * artifact-download collector runs in environments with no `gh` installed).
 */
export interface ArtifactOpsOptions {
  token?: string;
  owner?: string;
  repoName?: string;
  /** Injected in tests — defaults to the real subprocess-fetch (JSON) bridge. */
  http?: SyncHttp;
  /** Injected in tests — defaults to the real subprocess-fetch (binary) bridge. */
  binaryHttp?: SyncBinaryHttp;
  /** Injected in tests for git-derived repo-slug fallback. */
  exec?: (cmd: string, args: string[]) => string;
  env?: NodeJS.ProcessEnv;
}

export interface RunArtifact {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
}

interface RawArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
}

function resolveContext(opts: ArtifactOpsOptions): RestContext {
  const env = opts.env ?? process.env;
  const token = opts.token ?? resolveToken(env);
  const { owner, repo } =
    opts.owner && opts.repoName
      ? { owner: opts.owner, repo: opts.repoName }
      : resolveRepoSlug({ env, exec: opts.exec });
  const http = opts.http ?? defaultSyncHttp;
  return { token, owner, repo, http };
}

function mapArtifact(raw: RawArtifact): RunArtifact {
  return { id: raw.id, name: raw.name, sizeInBytes: raw.size_in_bytes, expired: raw.expired };
}

/** Lists every artifact uploaded by a workflow run (`gh run list`'s `databaseId`). */
export function listRunArtifacts(runId: number, opts: ArtifactOpsOptions = {}): RunArtifact[] {
  const ctx = resolveContext(opts);
  const { json } = apiRequest(
    ctx,
    "GET",
    `/repos/${ctx.owner}/${ctx.repo}/actions/runs/${runId}/artifacts?per_page=100`
  );
  const raw = (json as { artifacts?: RawArtifact[] } | null)?.artifacts ?? [];
  return raw.map(mapArtifact);
}

/** Downloads one artifact's zip archive as a Buffer. Throws on a non-200 response. */
export function downloadArtifactZip(artifactId: number, opts: ArtifactOpsOptions = {}): Buffer {
  const ctx = resolveContext(opts);
  const binaryHttp = opts.binaryHttp ?? defaultSyncBinaryHttp;
  const url = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/actions/artifacts/${artifactId}/zip`;
  const res = binaryHttp({
    method: "GET",
    url,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${ctx.token}`,
      "user-agent": "mbe-gh-client",
    },
  });
  if (res.status !== 200) {
    throw new Error(`gh-client: artifact ${artifactId} download failed with status ${res.status}`);
  }
  return Buffer.from(res.bodyBase64, "base64");
}
