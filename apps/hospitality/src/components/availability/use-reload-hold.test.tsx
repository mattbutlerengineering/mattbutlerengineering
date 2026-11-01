import { useEffect, type ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";

const api = vi.hoisted(() => ({
  availability: {
    saveConfig: vi.fn(),
    revertChange: vi.fn(),
    createClosure: vi.fn(),
    createClosures: vi.fn(),
    reopenClosure: vi.fn(),
    setTonight: vi.fn(),
    endTonight: vi.fn(),
  },
}));
vi.mock("../../hooks/useApiClient.js", () => ({ useApiClient: () => api }));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import {
  useRevertAvailabilityChange,
  useSaveAvailabilityConfig,
} from "../../hooks/useAvailability.js";
import { useCreateClosure, useCreateClosures, useReopenClosure } from "../../hooks/useClosures.js";
import { useEndTonight, useSetTonight } from "../../hooks/useTonight.js";
import { SpecialHoursEditDrawer } from "./SpecialHoursEditDrawer.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

const WAIT = "Edit once the newest hours have loaded.";
const SAVED = { version: 5, changeId: "chg-5" };

/** The saved version outlives every drawer, so each test has a venue of its own. */
let venue = 0;
const nextVenue = () => `venue-hold-${++venue}`;

/** Runs one version-moving mutation on mount, the way a surface outside the drawer would. */
function Saves(props: { readonly run: () => Promise<unknown> }) {
  const { run } = props;
  useEffect(() => {
    void run().catch(() => undefined);
    // Once: this stands for one save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe("the hold after the Manager's own save", () => {
  let client: QueryClient;
  let venueId: string;

  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient();
    venueId = nextVenue();
    for (const fn of Object.values(api.availability)) fn.mockResolvedValue(SAVED);
    api.availability.createClosures.mockResolvedValue({ version: 5, results: [] });
  });

  const state = (version: number): AvailabilityConfigState => ({
    config: fixtureConfig(EARLY_DINNER),
    version,
    source: "rows",
  });

  function tree(
    props: {
      readonly version?: number;
      readonly reloadError?: string | null;
      readonly onStale?: () => void;
      readonly children?: ReactNode;
    } = {}
  ) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>
          <main>
            {props.children}
            <SpecialHoursEditDrawer
              venueId={venueId}
              state={state(props.version ?? 4)}
              timezone={FIXTURE_TIMEZONE}
              today="2026-10-28"
              date={FIXTURE_DATE}
              reloadError={props.reloadError ?? null}
              onStale={props.onStale ?? vi.fn()}
              onClose={vi.fn()}
            />
          </main>
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  const edit = () => screen.getByRole("button", { name: "Edit Lunch" });
  /** The button appears only once the hold has lasted about 2 s. */
  const findReload = () => screen.findByRole("button", { name: "Reload hours" }, { timeout: 3000 });

  async function copyToFriday() {
    fireEvent.click(screen.getByRole("button", { name: "Copy to other days…" }));
    const dialog = screen.getByRole("dialog", { name: /Copy .* to other days/ });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Fri" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^Copy to \d+ dates?$/ }));
    await vi.waitFor(() => expect(edit()).toHaveAttribute("aria-disabled", "true"));
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("shows a failed reload with Retry on the Special dates drawer", async () => {
    const onStale = vi.fn();
    const view = render(tree({ onStale }));
    await copyToFriday();
    view.rerender(tree({ onStale, reloadError: "Network down" }));
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }));
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("offers a reload when no failure explains the hold, so an older read cannot lock Edit", async () => {
    const onStale = vi.fn();
    render(tree({ onStale }));
    await copyToFriday();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(await findReload());
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("offers no reload during a normal reload: only once the hold has lasted", async () => {
    render(tree());
    await copyToFriday();
    expect(screen.queryByRole("button", { name: "Reload hours" })).not.toBeInTheDocument();
    const wellIntoTheHoldMs = 1000;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, wellIntoTheHoldMs));
    });
    expect(screen.queryByRole("button", { name: "Reload hours" })).not.toBeInTheDocument();
    await findReload();
  });

  it("keeps Copy above everything the hold adds, so no control moves under a pointer", async () => {
    render(tree());
    const copy = screen.getByRole("button", { name: "Copy to other days…" });
    await copyToFriday();
    const reload = await findReload();
    const after = (el: Element) =>
      copy.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(after(reload)).toBeTruthy();
    expect(after(screen.getByText(WAIT))).toBeTruthy();
  });

  it("moves focus to Edit when a click on Reload hours ends the hold", async () => {
    const onStale = vi.fn();
    const view = render(tree({ onStale }));
    await copyToFriday();
    (await findReload()).focus();
    fireEvent.click(screen.getByRole("button", { name: "Reload hours" }));
    view.rerender(tree({ onStale, version: 5 }));
    expect(screen.queryByRole("button", { name: "Reload hours" })).not.toBeInTheDocument();
    expect(edit()).toHaveFocus();
  });

  it("leaves focus alone when the hold ends with no click on Reload hours", async () => {
    const view = render(tree());
    await copyToFriday();
    const copy = screen.getByRole("button", { name: "Copy to other days…" });
    copy.focus();
    view.rerender(tree({ version: 5 }));
    expect(copy).toHaveFocus();
  });

  it("moves focus to Retry when a click on Reload hours fails", async () => {
    const onStale = vi.fn();
    const view = render(tree({ onStale }));
    await copyToFriday();
    (await findReload()).focus();
    fireEvent.click(screen.getByRole("button", { name: "Reload hours" }));
    view.rerender(tree({ onStale, reloadError: "Network down" }));
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" })).toHaveFocus();
  });

  it("offers one way to reload, not two, beside a failed reload", async () => {
    const view = render(tree());
    await copyToFriday();
    await findReload();
    view.rerender(tree({ reloadError: "Network down" }));
    expect(screen.queryByRole("button", { name: "Reload hours" })).not.toBeInTheDocument();
  });

  it("does not offer a reload once the version is here", async () => {
    const view = render(tree());
    await copyToFriday();
    view.rerender(tree({ version: 5 }));
    await vi.waitFor(() => expect(screen.queryByText(WAIT)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Reload hours" })).not.toBeInTheDocument();
  });

  it("outlives the drawer: closed and opened again, Edit is still held", async () => {
    const view = render(tree());
    await copyToFriday();
    view.unmount();
    render(tree());
    expect(edit()).toHaveAttribute("aria-disabled", "true");
    expect(edit()).toHaveAccessibleDescription(WAIT);
  });

  it("ends for the opened-again drawer when the version arrives", async () => {
    const view = render(tree());
    await copyToFriday();
    view.unmount();
    const again = render(tree());
    again.rerender(tree({ version: 5 }));
    expect(edit()).not.toHaveAttribute("aria-disabled");
  });

  it("is kept per venue", async () => {
    const view = render(tree());
    await copyToFriday();
    view.unmount();
    venueId = nextVenue();
    render(tree());
    expect(edit()).not.toHaveAttribute("aria-disabled");
  });

  it("ignores a save refused by the server, which moved nothing", async () => {
    api.availability.saveConfig.mockRejectedValue(new Error("Network down"));
    function Save() {
      const { mutateAsync } = useSaveAvailabilityConfig();
      const body = { expectedVersion: 4, changes: {} } as never;
      return <Saves run={() => mutateAsync({ venueId, body })} />;
    }
    render(tree({ children: <Save /> }));
    await act(async () => {
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(edit()).not.toHaveAttribute("aria-disabled"));
  });

  describe.each([
    {
      name: "Undo",
      Surface: function Surface(props: { readonly venueId: string }) {
        const { mutateAsync } = useRevertAvailabilityChange();
        const run = () =>
          mutateAsync({ venueId: props.venueId, changeId: "chg-4", expectedVersion: 4 });
        return <Saves run={run} />;
      },
    },
    {
      name: "a closure",
      Surface: function Surface(props: { readonly venueId: string }) {
        const { mutateAsync } = useCreateClosure();
        const run = () =>
          mutateAsync({ venueId: props.venueId, body: {} as never, idempotencyKey: "k" });
        return <Saves run={run} />;
      },
    },
    {
      name: "a batch of closures",
      Surface: function Surface(props: { readonly venueId: string }) {
        const { mutateAsync } = useCreateClosures();
        const run = () =>
          mutateAsync({ venueId: props.venueId, body: {} as never, idempotencyKey: "k" });
        return <Saves run={run} />;
      },
    },
    {
      name: "a reopened closure",
      Surface: function Surface(props: { readonly venueId: string }) {
        const { mutateAsync } = useReopenClosure();
        const run = () =>
          mutateAsync({ venueId: props.venueId, ruleId: "r", tellCancelledGuests: false });
        return <Saves run={run} />;
      },
    },
    {
      name: "a Tonight change",
      Surface: function Surface(props: { readonly venueId: string }) {
        const { mutateAsync } = useSetTonight();
        return <Saves run={() => mutateAsync({ venueId: props.venueId, body: {} as never })} />;
      },
    },
    {
      name: "an ended Tonight change",
      Surface: function Surface(props: { readonly venueId: string }) {
        const { mutateAsync } = useEndTonight();
        return <Saves run={() => mutateAsync({ venueId: props.venueId, ruleId: "r" })} />;
      },
    },
  ])("from $name, a save made outside the drawer", ({ Surface }) => {
    it("holds Edit until the reload brings its version", async () => {
      const view = render(tree({ children: <Surface venueId={venueId} /> }));
      await vi.waitFor(() => expect(edit()).toHaveAttribute("aria-disabled", "true"));
      await act(async () => {
        await Promise.resolve();
      });
      expect(edit()).toHaveAttribute("aria-disabled", "true");
      view.rerender(tree({ version: 5, children: <Surface venueId={venueId} /> }));
      expect(edit()).not.toHaveAttribute("aria-disabled");
    });
  });
});
