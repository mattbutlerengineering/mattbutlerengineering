import { ApiClient } from "./client.js";
import type { ClientConfig, PerRequestOptions, QueryParams } from "./client.js";

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

  async createSession(
    body: CreateSessionRequest,
    override?: PerRequestOptions
  ): Promise<SessionSummary> {
    return this.postOne<SessionSummary>("/v1/sessions", body, override);
  }

  async getSession(id: string, override?: PerRequestOptions): Promise<SessionSummary> {
    return this.getOne<SessionSummary>(`/v1/sessions/${id}`, undefined, override);
  }

  async listSessions(
    params: ListSessionsParams = {},
    override?: PerRequestOptions
  ): Promise<PaginatedSessions> {
    return this.get<PaginatedSessions>("/v1/sessions", params as QueryParams, undefined, override);
  }

  async cancelSession(id: string, override?: PerRequestOptions): Promise<SessionSummary> {
    return this.postOne<SessionSummary>(`/v1/sessions/${id}/cancel`, {}, override);
  }
}
