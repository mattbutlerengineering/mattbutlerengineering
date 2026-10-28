import { describe, it, expect } from "vitest";
import { catalog } from "@mbe/rialto-catalog/catalog";
import { buildAgentSystemPrompt, chatComponentReference } from "./gen-agent-prompt.js";
import { genAgentSystemPrompt } from "./gen-agent.js";

const NOW = new Date("2026-10-25T02:00:00Z"); // Sat Oct 24, 7pm Pacific

describe("buildAgentSystemPrompt", () => {
  it("anchors relative dates to the venue's today, not UTC's", () => {
    const prompt = buildAgentSystemPrompt({
      venueId: "venue-1",
      timeZone: "America/Los_Angeles",
      now: NOW,
      catalogPrompt: "CATALOG",
    });

    expect(prompt).toContain("Saturday, 2026-10-24");
    expect(prompt).toContain("America/Los_Angeles");
    expect(prompt).not.toContain("2026-10-25");
  });

  it("tells the model the venue is already selected and never to ask for ids", () => {
    const prompt = buildAgentSystemPrompt({
      venueId: "venue-1",
      now: NOW,
      catalogPrompt: "CATALOG",
    });

    expect(prompt).toMatch(/venue is already selected/i);
    expect(prompt).toMatch(/never ask .*venue ID/i);
    expect(prompt).not.toMatch(/no venue is selected/i);
  });

  it("asks the user to pick a venue when none is selected", () => {
    const prompt = buildAgentSystemPrompt({ now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toMatch(/no venue is selected/i);
  });

  it("tells the model its earlier replies were grounded, so it stops 'correcting' them", () => {
    // Live run 2026-10-24: history carries only reply text, not tool calls, so
    // every turn opened with "I hadn't checked the system before I answered".
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toMatch(/earlier replies .*tool results/i);
    expect(prompt).toMatch(/don't apologize for or correct/i);
  });

  it("explains the table status lifecycle in staff terms", () => {
    // Live run 2026-10-24: "I can't tell whether READY tables are free to seat."
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toContain("AVAILABLE");
    expect(prompt).toMatch(/only an AVAILABLE table can be seated/i);
    expect(prompt).toMatch(/"clean", that means READY/i);
    expect(prompt).toMatch(/plain words/i);
  });

  it("points staff at the Confirm button, never at typing yes", () => {
    // Live run 2026-10-24: the model said "Reply yes to confirm", but typing a
    // message while a confirm is pending cancels it in the chat UI.
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toMatch(/Confirm or Cancel button/);
    expect(prompt).toMatch(/never ask them to type yes/i);
  });

  // #7918: the chat makes Tonight changes and undoes the newest change; every
  // other availability change belongs on the Availability page.
  it("scopes availability changes to Tonight and undo, and sends the rest to the Availability page", () => {
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });
    const confirmLine = prompt.split("\n").find((line) => /Confirm or Cancel button/.test(line));

    expect(confirmLine).toMatch(/Tonight availability/i);
    expect(prompt).toMatch(/change_tonight_availability/);
    expect(prompt).toMatch(
      /list_tonight_changes .*before .*end_tonight_change .*undo_availability_change/i
    );
    expect(prompt).toMatch(/closures, special hours.*Availability page/i);
  });

  describe("the page the chat is open on (#7924)", () => {
    const base = { venueId: "v", now: NOW, catalogPrompt: "CATALOG" };

    it("names the page and what it shows", () => {
      const prompt = buildAgentSystemPrompt({ ...base, page: "availability" });

      expect(prompt).toMatch(/chat open on the Availability page/);
    });

    it("resolves 'this' to the focused record and names the day on screen", () => {
      const prompt = buildAgentSystemPrompt({
        ...base,
        page: "timeline",
        focus: { kind: "reservation", id: "res-42" },
        focusDate: "2026-10-30",
      });

      expect(prompt).toMatch(/reservation res-42/);
      expect(prompt).toMatch(/"this reservation"/);
      expect(prompt).toMatch(/2026-10-30/);
    });

    it("says nothing about a page when none was sent", () => {
      const prompt = buildAgentSystemPrompt(base);

      expect(prompt).not.toMatch(/chat open on/);
    });
  });

  describe("maps each data shape to the element that shows it", () => {
    const prompt = buildAgentSystemPrompt({
      venueId: "venue-1",
      now: NOW,
      catalogPrompt: "CATALOG",
    });
    // The line that says "as <Element>" (or "as a/an <Element>").
    const showsAs = (line: string, element: string): boolean => {
      const words = line.split(/[\s,.()]+/);
      return words.some((word, i) => {
        if (word !== element) return false;
        const before = words[i - 1];
        return before === "as" || ((before === "a" || before === "an") && words[i - 2] === "as");
      });
    };
    const lineFor = (element: string): string =>
      prompt.split("\n").find((line) => showsAs(line, element)) ?? "";

    it("reservations from list_today_reservations or lookup_reservation as ReservationList", () => {
      const line = lineFor("ReservationList");
      expect(line).toMatch(/list_today_reservations/);
      expect(line).toMatch(/lookup_reservation/);
      expect(line).toMatch(/arrival order/i);
      expect(line).toMatch(/localTime/);
      expect(line).toMatch(/status .*as is/i);
      expect(line).toMatch(/guestName as the guest/i);
      expect(line).toMatch(/walk-in/i);
      expect(line).toMatch(/tonight .*leave cancelled and no-show rows out/i);
    });

    // Review of gen-ui-elements-2 (major 1): lookup_reservation spans dates, and
    // localTime is a clock time only, so rows on two days read the same.
    it("puts the date in each row's time when the rows span more than one date", () => {
      expect(lineFor("ReservationList")).toMatch(/more than one date[^.]*date[^.]*time/i);
    });

    it("open slots from check_availability as TimeSlots, never for a closed or full day", () => {
      const line = lineFor("TimeSlots");
      expect(line).toMatch(/check_availability/);
      expect(line).toMatch(/localTime/);
      expect(line).toMatch(/open times only/i);
      expect(line).toMatch(/closed or fully booked day .*in words/i);
    });

    it("tells the model an empty online list is not proof of a full day", () => {
      const line = lineFor("TimeSlots");
      expect(line).toMatch(/online/i);
      expect(line).toMatch(/check_booking_time/);
    });

    it("guests from search_guests as GuestCards, at most five, without private details", () => {
      const line = lineFor("GuestCards");
      expect(line).toMatch(/search_guests/);
      expect(line).toMatch(/at most five/i);
      expect(line).toMatch(/how many more matched/i);
      expect(line).toMatch(/never .*email, phone, notes or spend/i);
    });

    it("maps a guest row's visitCount and riskScore onto the card's visits and risk", () => {
      const line = lineFor("GuestCards");
      expect(line).toMatch(/visitCount as visits/);
      expect(line).toMatch(/riskScore[^.]*as risk/);
    });

    it("a guest's visit history as Timeline", () => {
      expect(lineFor("Timeline")).toMatch(/visit history/i);
    });

    it("table statuses from get_table_status as StatusLED", () => {
      expect(lineFor("StatusLED")).toMatch(/get_table_status/);
    });

    it("headline counts as Stat, tags as Tag, other lists as Table", () => {
      expect(lineFor("Stat")).toMatch(/counts/i);
      expect(lineFor("Tag")).toMatch(/dietary/i);
      expect(lineFor("Table")).toMatch(/other lists/i);
    });

    it("never maps a night's bookings to Timeline", () => {
      expect(lineFor("Timeline")).not.toMatch(/booking|reservation|arrival/i);
      expect(prompt).not.toMatch(/night's bookings[^\n]*Timeline/i);
    });
  });

  it("keeps the catalog's component rules, after the assistant guidance", () => {
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt.endsWith("CATALOG")).toBe(true);
  });
});

// Live chat batch 9 (F33): the chat appended json-render's full catalog.prompt(),
// a generator spec ("Output ONLY JSONL patches"), and asked for "a short label
// above the list" the model wrote the patch lines as reply text. The chat now
// gets only the component list, and is told elements go through render_component.
describe("chat component reference", () => {
  const reference = chatComponentReference(catalog.prompt());

  it("keeps the component list, including the chat elements", () => {
    expect(reference.startsWith("AVAILABLE COMPONENTS (")).toBe(true);
    for (const name of ["ReservationList", "TimeSlots", "GuestCards", "StatusLED", "Text"]) {
      expect(reference).toContain(`- ${name}:`);
    }
  });

  it("drops the generator's JSONL, state and output rules", () => {
    expect(reference).not.toMatch(/JSONL|"op"|AVAILABLE ACTIONS|INITIAL STATE|RULES:/);
  });

  it("fails loudly if the catalog prompt's layout changes", () => {
    expect(() => chatComponentReference("no markers here")).toThrow(/AVAILABLE COMPONENTS/);
    expect(() => chatComponentReference("AVAILABLE COMPONENTS (1):\n\n- A: {}")).toThrow(
      /AVAILABLE ACTIONS/
    );
  });

  it("is what the chat route sends, with no JSONL anywhere", () => {
    const prompt = genAgentSystemPrompt({ venueId: "v", timeZone: "UTC" }, catalog.prompt());

    expect(prompt).toContain("- ReservationList:");
    expect(prompt).not.toMatch(/JSONL|"op"/);
    expect(prompt.length).toBeLessThan(catalog.prompt().length);
  });

  it("tells the model elements go only through render_component", () => {
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toMatch(/render_component[^.\n]*elements/);
    expect(prompt).toMatch(/never write JSON[^.\n]*reply/i);
  });
});

// #7926: the chat runs the waitlist now.
describe("waitlist in the prompt", () => {
  it("lists waitlist changes among the confirmed ones and no longer says the waitlist is unsupported", () => {
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });
    const confirmLine = prompt.split("\n").find((line) => /Confirm or Cancel button/.test(line));

    expect(confirmLine).toMatch(/waitlist/);
    expect(prompt).toMatch(/list_waitlist/);
    expect(prompt).toMatch(/seat_waitlist_party.*not seat_walk_in/i);
    expect(prompt).not.toMatch(/can't manage the waitlist/i);
  });
});
