import type { ApiClient } from "./client.js";

export type FeedbackType = "bug" | "idea" | "other";

export interface FeedbackContext {
  readonly app: string;
  readonly route: string;
  readonly viewport: string;
  readonly version: string;
}

export interface SubmitFeedbackRequest {
  readonly type: FeedbackType;
  readonly message: string;
  readonly email?: string;
  readonly context: FeedbackContext;
}

export interface SubmittedFeedback {
  readonly issueNumber: number;
  readonly url: string;
}

/**
 * Served by agent-api under the gen prefix, which the DigitalOcean ingress
 * already routes to it. The server holds the GitHub token; this client never
 * sees one.
 */
const API_PREFIX = "/api";
const FEEDBACK_PATH = `${API_PREFIX}/gen/feedback`;

export class FeedbackClient {
  constructor(private client: ApiClient) {}

  submit(request: SubmitFeedbackRequest): Promise<SubmittedFeedback> {
    return this.client.postOne<SubmittedFeedback>(FEEDBACK_PATH, request);
  }

  /** False when the server has no feedback token, so the UI can hide the control. */
  async isAvailable(): Promise<boolean> {
    const status = await this.client.getOne<{ available: boolean }>(`${FEEDBACK_PATH}/status`);
    return status.available;
  }
}
