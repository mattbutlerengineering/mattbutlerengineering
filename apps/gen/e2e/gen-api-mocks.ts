import type { Page, Route } from "@playwright/test";

/** One line of the NDJSON a `/api/gen/ui` stream carries (a json-render FlatElement). */
export interface FlatElementLine {
  key: string;
  type: string;
  props: Record<string, unknown>;
  parentKey?: string;
}

interface StoredEntry {
  id: string;
  userId: string;
  prompt: string;
  kind?: string;
  spec: unknown;
  rawLines: string[];
  isFavorite: boolean;
  refinement?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface GenApiMocks {
  /** Bodies of every `POST /api/gen/ui`, in request order. */
  uiRequests: Array<Record<string, unknown>>;
  /** The entries `GET /api/gen/specs` currently returns, newest first. */
  entries: StoredEntry[];
}

export interface GenApiResponses {
  /** Streamed for a whole-spec generation. */
  generate: FlatElementLine[];
  /** Streamed for a node refinement; its root key must equal the selected node's key. */
  refineSubtree: FlatElementLine[];
}

function ndjson(lines: FlatElementLine[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

/**
 * Stateful mocks for the generation and history APIs. Saved entries come back on the next
 * list call, favorites and deletes mutate the list, and every `/api/gen/ui` request is
 * recorded so a spec can assert that a replay never reached the model.
 */
export async function mockGenApi(page: Page, responses: GenApiResponses): Promise<GenApiMocks> {
  const mocks: GenApiMocks = { uiRequests: [], entries: [] };
  let nextId = 1;

  await page.route("**/api/gen/ui", async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mocks.uiRequests.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson(body.target ? responses.refineSubtree : responses.generate),
    });
  });

  await page.route("**/api/gen/specs**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname.endsWith("/api/gen/specs") && method === "GET") {
      return route.fulfill({ json: { data: mocks.entries } });
    }
    if (url.pathname.endsWith("/api/gen/specs") && method === "POST") {
      const body = request.postDataJSON() as Partial<StoredEntry>;
      const now = new Date().toISOString();
      const created: StoredEntry = {
        id: `spec-${nextId++}`,
        userId: "e2e-user",
        prompt: body.prompt ?? "",
        kind: body.kind,
        spec: body.spec,
        rawLines: body.rawLines ?? [],
        isFavorite: false,
        refinement: body.refinement,
        createdAt: now,
        updatedAt: now,
      };
      mocks.entries = [created, ...mocks.entries];
      return route.fulfill({ status: 201, json: { data: created } });
    }
    return route.fulfill({ status: 204, body: "" });
  });

  return mocks;
}
