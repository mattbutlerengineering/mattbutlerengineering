import type { Deposit } from "@mbe/types";
import { DepositSchema } from "@mbe/types";
import type { ApiClient } from "./client.js";

const DEPOSIT_BASE_PATH = "/api/v1/deposits";

export interface CreateDepositRequest {
  reservationId: string;
  amountCents: number;
  currency?: string;
}

/** The three back-office deposit state transitions. */
export type DepositTransition = "capture" | "refund" | "forfeit";

/**
 * Deposit resource: the single seam for reading and money-moving a
 * reservation's deposit. `create` collects a deposit and `get` reads one back;
 * `capture`, `refund`, and `forfeit` are named conveniences over the generic
 * `transition(id, action)`, mirroring the server's shared transition handler.
 * Each method owns its path, targets the back-office `/api/v1/deposits`
 * surface, and unwraps + validates the `{ data: Deposit }` envelope behind the
 * seam.
 */
export class DepositsClient {
  constructor(private client: ApiClient) {}

  /**
   * Create (collect) a deposit for a reservation.
   */
  async create(data: CreateDepositRequest): Promise<Deposit> {
    return this.client.postOne<Deposit>(DEPOSIT_BASE_PATH, data, DepositSchema);
  }

  /**
   * Read a single deposit by id.
   */
  async get(id: string): Promise<Deposit> {
    return this.client.getOne<Deposit>(`${DEPOSIT_BASE_PATH}/${id}`, undefined, DepositSchema);
  }

  /**
   * Capture (apply) a held deposit — charges the card.
   */
  async capture(id: string): Promise<Deposit> {
    return this.transition(id, "capture");
  }

  /**
   * Refund a held deposit — releases the authorization.
   */
  async refund(id: string): Promise<Deposit> {
    return this.transition(id, "refund");
  }

  /**
   * Forfeit a held deposit — captures it as a no-show/late-cancel fee.
   */
  async forfeit(id: string): Promise<Deposit> {
    return this.transition(id, "forfeit");
  }

  /**
   * Run a back-office deposit state transition (`capture` | `refund` | `forfeit`).
   */
  async transition(id: string, action: DepositTransition): Promise<Deposit> {
    return this.client.postOne<Deposit>(
      `${DEPOSIT_BASE_PATH}/${id}/${action}`,
      undefined,
      DepositSchema
    );
  }
}
