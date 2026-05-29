import { ApiClient } from "./client.js";
import type { ClientConfig } from "./client.js";

export interface SessionSummary {
  readonly id: string;
  readonly status: string;
  readonly taskDescription: string;
  readonly branchName: string | null;
  readonly prUrl: string | null;
  readonly costUsd: number | null;
  readonly errors: readonly string[];
}

export interface PaginatedSessions {
  readonly data: readonly SessionSummary[];
  readonly pagination: {
    readonly page: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

export interface CreateSessionRequest {
  taskDescription: string;
  model?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  baseBranch?: string;
  parentId?: string;
}

export interface ListSessionsParams {
  status?: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  page?: number;
  limit?: number;
}

export class AgentSessionClient extends ApiClient {
  constructor(config: ClientConfig) {
    super(config);
  }

  async createSession(body: CreateSessionRequest): Promise<SessionSummary> {
    return this.postOne<SessionSummary>("/v1/sessions", body);
  }

  async getSession(id: string): Promise<SessionSummary> {
    return this.getOne<SessionSummary>(`/v1/sessions/${id}`);
  }

  async listSessions(params: ListSessionsParams = {}): Promise<PaginatedSessions> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return this.get<PaginatedSessions>(`/v1/sessions${query ? `?${query}` : ""}`);
  }

  async cancelSession(id: string): Promise<SessionSummary> {
    return this.postOne<SessionSummary>(`/v1/sessions/${id}/cancel`, {});
  }
}
