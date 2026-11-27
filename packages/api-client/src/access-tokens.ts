import { z } from "zod";
import type {
  AccessToken,
  CreateAccessTokenRequest,
  CurrentAccessToken,
  MintedAccessToken,
} from "@mbe/types";
import {
  ACCESS_TOKENS_PREFIX,
  CURRENT_ACCESS_TOKEN_PATH,
  AccessTokenSchema,
  CurrentAccessTokenSchema,
  MintedAccessTokenSchema,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

const TOKENS_PATH = ACCESS_TOKENS_PREFIX;

/**
 * Settings → Access tokens: a user's personal access tokens for remote MCP
 * clients. Paths match `services/reservations/src/routes/access-tokens.ts`.
 */
export class AccessTokensClient {
  constructor(private client: ApiClient) {}

  async list(): Promise<AccessToken[]> {
    return this.client.getOne<AccessToken[]>(TOKENS_PATH, undefined, z.array(AccessTokenSchema));
  }

  /** The plaintext `token` in the result is shown once; it cannot be fetched again. A 409 means the 10-token cap is reached. */
  async mint(input: CreateAccessTokenRequest): Promise<MintedAccessToken> {
    return this.client.postOne<MintedAccessToken>(TOKENS_PATH, input, MintedAccessTokenSchema);
  }

  async revoke(id: string): Promise<void> {
    await this.client.delete(`${TOKENS_PATH}/${encodeURIComponent(id)}`);
  }

  /** The scope of the personal access token this client presents (404 for a session caller). */
  async current(): Promise<CurrentAccessToken> {
    return this.client.getOne<CurrentAccessToken>(
      CURRENT_ACCESS_TOKEN_PATH,
      undefined,
      CurrentAccessTokenSchema
    );
  }
}
