import { describe, it, expect, vi, beforeEach } from "vitest";

import { setVenueContext, type VenueContextClient } from "./venue-context.js";
import { setRlsTripwireLogger } from "../services/rls-context-mode.js";

function fakeClient(): VenueContextClient & {
  $executeRaw: ReturnType<typeof vi.fn>;
  $executeRawUnsafe: ReturnType<typeof vi.fn>;
} {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  };
}

describe("setVenueContext", () => {
  it("sets app.venue_id via a parameterized set_config() when a venue id is given", async () => {
    const client = fakeClient();

    await setVenueContext(client, "venue-1");

    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = client.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    // Parameterized tagged-template call: the venue id must be a bound
    // value, never interpolated into the SQL string itself. `set_config()`
    // is used instead of `SET LOCAL app.venue_id = ?` because Postgres's
    // SET/SET LOCAL grammar does not accept a bind parameter in the value
    // position — only set_config() does.
    expect(strings.join("?")).toBe("SELECT set_config('app.venue_id', ?, true)");
    expect(values).toEqual(["venue-1"]);
  });

  it("does not run set_config() when venueId is null (default-deny per ADR-026 §4)", async () => {
    const client = fakeClient();

    await setVenueContext(client, null);

    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it("assumes app_reservations when venueId is null, and does not run set_config", async () => {
    const client = fakeClient();

    await setVenueContext(client, null);

    expect(client.$executeRaw).not.toHaveBeenCalled();
    expect(client.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(client.$executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL ROLE "app_reservations"');
  });

  it("assumes app_reservations before set_config when a venue id is given", async () => {
    const client = fakeClient();

    await setVenueContext(client, "venue-1");

    expect(client.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(client.$executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL ROLE "app_reservations"');
    const roleOrder = client.$executeRawUnsafe.mock.invocationCallOrder[0] ?? Infinity;
    const setConfigOrder = client.$executeRaw.mock.invocationCallOrder[0] ?? -Infinity;
    expect(roleOrder).toBeLessThan(setConfigOrder);
  });

  it("does not run set_config() when venueId is undefined", async () => {
    const client = fakeClient();

    await setVenueContext(client, undefined);

    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  describe("unscoped-query tripwire (ADR-026 §3.3 / #5369 PR 1)", () => {
    const logger = { warn: vi.fn() };

    beforeEach(() => {
      logger.warn.mockClear();
      setRlsTripwireLogger(logger);
    });

    it("logs rls_unscoped_query (model: null — this function can't attribute one) when called with no options at all", async () => {
      const client = fakeClient();

      await setVenueContext(client, null);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { model: null, method: "setVenueContext", route: null },
        "rls_unscoped_query"
      );
    });

    it("skips the check when skipUnscopedQueryCheck is set (the venue-scoped-prisma auto-wrap's own call site)", async () => {
      const client = fakeClient();

      await setVenueContext(client, null, { skipUnscopedQueryCheck: true });

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does not log when a real venue id is given", async () => {
      const client = fakeClient();

      await setVenueContext(client, "venue-1");

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
