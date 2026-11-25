import { describe, expect, it, vi } from "vitest";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import type { ConfigState } from "./availability-config.js";
import type { SaveRequest } from "./availability-commit.js";
import { availabilityStore, type Store } from "../test/availability-store.js";

vi.mock("./database.js", () => ({ prisma: {} }));

const { commitSave } = await import("./availability-commit.js");

const NOW = new Date("2026-10-25T19:00:00.000Z");
const WHO = { venueId: "v", actorId: "mgr-1", now: NOW };

const rule = (id: string, stop: { from: number; to: number }): DateRule =>
  ({
    id,
    kind: "tonight",
    targetKind: "booking",
    bookingTypes: ["online"],
    payload: { version: 1, stop },
    startsOn: "2026-10-25",
    endsOn: "2026-10-25",
    expiresAt: "2026-10-26T07:00:00.000Z",
  }) as DateRule;

/** A stored closure that ends before it starts: invalid, and nothing the tests below touch. */
const BAD_STORED = {
  id: "bad",
  kind: "closure",
  targetKind: "venue",
  venueServiceId: null,
  bookingTypes: [],
  startsOn: new Date("2026-12-24T00:00:00.000Z"),
  endsOn: new Date("2026-12-20T00:00:00.000Z"),
  repeat: null,
  window: null,
  payload: {},
  seriesId: null,
  guestMessage: null,
  staffNote: null,
  expiresAt: null,
  deletedAt: null,
};

const store = (patch: Partial<Store> = {}): Store => ({
  version: 9,
  dateRules: [],
  changes: [],
  ...patch,
});

const withRule = (config: AvailabilityConfig, added: DateRule): AvailabilityConfig => ({
  ...config,
  dateRules: [...config.dateRules, added],
});

describe("commitSave", () => {
  describe("version", () => {
    it("{ current: true } bumps without a compare-and-set and answers the version it reached", async () => {
      const s = store();
      const { tx } = availabilityStore(s);

      const saved = await commitSave(
        tx as never,
        { ...WHO, version: { current: true } },
        async (state) => ({
          next: withRule(state.effective, rule("r1", { from: 0, to: 60 })),
          kind: "tonight",
        })
      );

      expect(saved).toMatchObject({ kind: "saved", version: 10 });
      expect(s.changes[0]).toMatchObject({ version: 10 });
      expect((tx.venue as { updateMany: unknown }).updateMany).not.toHaveBeenCalled();
    });

    it("{ expected } refuses a stale draft with the winner and rolls nothing forward", async () => {
      const s = store();
      const { tx } = availabilityStore(s);

      await expect(
        commitSave(tx as never, { ...WHO, version: { expected: 4 } }, async (state) => ({
          next: state.effective,
          kind: "tonight",
        }))
      ).rejects.toMatchObject({ outcome: { kind: "version_conflict" } });
      expect(s.version).toBe(9);
      expect(s.changes).toEqual([]);
    });

    it("hands resolve the version this save commits at", async () => {
      const { tx } = availabilityStore(store());
      const resolve = vi.fn(
        async (
          state: ConfigState,
          _committed: { committedVersion: number }
        ): Promise<SaveRequest> => ({
          next: state.effective,
          kind: "tonight",
        })
      );

      await commitSave(tx as never, { ...WHO, version: { expected: 9 } }, resolve);

      expect(resolve.mock.calls[0]![1]).toEqual({ committedVersion: 10 });
    });
  });

  describe("a { next } body", () => {
    it("writes the rows and one audit row, with what prepare contributes from the plan", async () => {
      const s = store();
      const { tx, create } = availabilityStore(s);
      const prepare = vi.fn(async () => ({
        inverseMeta: { tonight: { ruleId: "r1", version: 10 } },
        summary: "Prepared summary",
        detail: { code: "tonight_ended" } as never,
      }));

      await commitSave(tx as never, { ...WHO, version: { expected: 9 } }, async (state) => ({
        next: withRule(state.effective, rule("r1", { from: 0, to: 60 })),
        kind: "tonight",
        prepare,
      }));

      expect(s.dateRules.map((r) => r["id"])).toEqual(["r1"]);
      expect(prepare).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ kind: "write", diff: expect.anything() })
      );
      const data = create.mock.calls[0]![0].data;
      expect(data).toMatchObject({
        kind: "tonight",
        summary: "Prepared summary",
        summaryDetail: { code: "tonight_ended" },
        version: 10,
        inverse: { remove: { dateRules: ["r1"] }, tonight: { ruleId: "r1", version: 10 } },
      });
    });

    it("validates the whole config by default, so an unrelated invalid row refuses it", async () => {
      const { tx } = availabilityStore(store({ dateRules: [BAD_STORED] }));

      await expect(
        commitSave(tx as never, { ...WHO, version: { expected: 9 } }, async (state) => ({
          next: withRule(state.effective, rule("r1", { from: 0, to: 60 })),
          kind: "tonight",
          validate: "full",
        }))
      ).rejects.toMatchObject({ outcome: { kind: "invalid" } });
    });

    it('validate: "touched" lets a change through on a venue holding an unrelated invalid row', async () => {
      const s = store({ dateRules: [BAD_STORED] });
      const { tx } = availabilityStore(s);

      const saved = await commitSave(
        tx as never,
        { ...WHO, version: { expected: 9 } },
        async (state) => ({
          next: withRule(state.effective, rule("r1", { from: 0, to: 60 })),
          kind: "tonight",
          validate: "touched",
        })
      );

      expect(saved.kind).toBe("saved");
    });

    it('validate: "touched" still refuses the rows the change itself creates', async () => {
      const s = store({ dateRules: [BAD_STORED] });
      const { tx } = availabilityStore(s);

      await expect(
        commitSave(tx as never, { ...WHO, version: { expected: 9 } }, async (state) => ({
          next: withRule(state.effective, rule("r1", { from: 100, to: 50 })),
          kind: "tonight",
          validate: "touched",
        }))
      ).rejects.toMatchObject({
        outcome: {
          kind: "invalid",
          issues: [expect.objectContaining({ code: "window_ends_before_start" })],
        },
      });
      expect(s.dateRules).toHaveLength(1);
    });
  });

  describe("stranded", () => {
    const request = (stranded?: "refuse" | "caller") => async (state: ConfigState) => ({
      next: withRule(state.effective, rule("r1", { from: 0, to: 60 })),
      kind: "tonight",
      ...(stranded ? { stranded } : {}),
    });

    it('"caller" leaves the bookings check to the caller', async () => {
      const { tx } = availabilityStore(store());
      await commitSave(tx as never, { ...WHO, version: { expected: 9 } }, request("caller"));
      expect((tx.reservation as { findMany: unknown }).findMany).not.toHaveBeenCalled();
    });

    it('"refuse" (the default) reads the bookings the change could strand', async () => {
      const { tx } = availabilityStore(store());
      await commitSave(tx as never, { ...WHO, version: { expected: 9 } }, request());
      expect((tx.reservation as { findMany: unknown }).findMany).toHaveBeenCalled();
    });
  });
});
