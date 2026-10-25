import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { ChatPanel } from "@mattbutlerengineering/rialto";
import { registry } from "@mbe/rialto-catalog";
import { HOSPITALITY_DOMAIN_CONTEXT } from "../constants/copilotContext.js";

// The catalog registry's components implement json-render's
// ComponentRenderProps contract ({ element, children, emit, on }). This pins
// ChatPanel's element rendering to that contract against the REAL registry —
// the drawer shipped broken because ChatPanel was only ever tested with
// plain-prop stand-in components.
describe("ChatPanel with the real catalog registry", () => {
  it("renders a streamed element as a real Rialto component, not a placeholder", async () => {
    const user = userEvent.setup();
    async function* stream() {
      yield {
        type: "element",
        element: { id: "el-1", type: "Card", props: { title: "Tonight at a glance" } },
      };
      yield { type: "text", content: "Here you go." };
    }

    render(
      <ChatPanel
        standalone
        onClose={() => {}}
        api="/api/gen/agent"
        stream={stream}
        domainContext={HOSPITALITY_DOMAIN_CONTEXT}
        getAccessToken={() => "test-token"}
        registry={registry}
      />
    );

    await user.type(screen.getByRole("textbox", { name: /chat input/i }), "show tonight{Enter}");

    expect(await screen.findByText("Tonight at a glance")).toBeInTheDocument();
    // The unknown-type placeholder carries data-element-type; a real render must not.
    expect(document.querySelector("[data-element-type]")).toBeNull();
    // A seam fallback would mean the registry rejected the element's props.
    expect(document.querySelector("[data-rialto-seam-fallback]")).toBeNull();
  });

  it("renders the hospitality data elements through the real registry", async () => {
    const user = userEvent.setup();
    const elements = [
      { id: "row", type: "Stack", props: { direction: "row" }, children: ["covers", "free"] },
      { id: "covers", type: "Stat", props: { label: "Covers tonight", value: 42 } },
      { id: "free", type: "StatusLED", props: { variant: "success", label: "Patio 2: free" } },
      {
        id: "night",
        type: "Timeline",
        props: { events: [{ title: "Garcia, party of 4", timestamp: "6:30 PM" }] },
      },
      { id: "diet", type: "Tag", props: { label: "Gluten-free" } },
    ];
    async function* stream() {
      for (const element of elements) yield { type: "element", element };
      yield { type: "text", content: "Here is tonight." };
    }

    render(
      <ChatPanel
        standalone
        onClose={() => {}}
        api="/api/gen/agent"
        stream={stream}
        domainContext={HOSPITALITY_DOMAIN_CONTEXT}
        getAccessToken={() => "test-token"}
        registry={registry}
      />
    );

    await user.type(screen.getByRole("textbox", { name: /chat input/i }), "how is tonight{Enter}");

    expect(await screen.findByText("Covers tonight")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Patio 2: free")).toBeInTheDocument();
    expect(screen.getByText("Garcia, party of 4")).toBeInTheDocument();
    expect(screen.getByText("Gluten-free")).toBeInTheDocument();
    expect(document.querySelector("[data-element-type]")).toBeNull();
    expect(document.querySelector("[data-rialto-seam-fallback]")).toBeNull();
  });
  it("renders ReservationList, TimeSlots and GuestCards through the real registry", async () => {
    const user = userEvent.setup();
    const elements = [
      {
        id: "tonight",
        type: "ReservationList",
        props: {
          reservations: [
            { time: "6:30 PM", guest: "Garcia", partySize: 4, status: "CONFIRMED" },
            // A walk-in copied from the tool arrives with guestName: null.
            { time: "7:00 PM", guest: null, partySize: 2, status: "SEATED" },
          ],
        },
      },
      {
        id: "slots",
        type: "TimeSlots",
        props: { date: "Friday, Oct 30", partySize: 4, times: ["7:30 PM", "8:00 PM"] },
      },
      {
        id: "guests",
        type: "GuestCards",
        props: {
          guests: [
            { name: "Maria Garcia", visits: 12, risk: "trusted", tags: ["VIP"] },
            // search_guests returns tags: null for an untagged guest.
            { name: "Tom Nguyen", visits: 1, risk: "standard", tags: null },
          ],
        },
      },
    ];
    async function* stream() {
      for (const element of elements) yield { type: "element", element };
      yield { type: "text", content: "Here is tonight." };
    }

    render(
      <ChatPanel
        standalone
        onClose={() => {}}
        api="/api/gen/agent"
        stream={stream}
        domainContext={HOSPITALITY_DOMAIN_CONTEXT}
        getAccessToken={() => "test-token"}
        registry={registry}
      />
    );

    await user.type(screen.getByRole("textbox", { name: /chat input/i }), "who is coming{Enter}");

    const reservations = await screen.findByRole("list", { name: "Reservations" });
    expect(reservations).toHaveTextContent("Garcia");
    expect(reservations).toHaveTextContent("Walk-in");
    expect(screen.getByRole("list", { name: "Open times" })).toHaveTextContent("7:30 PM");
    const guests = screen.getByRole("list", { name: "Guests" });
    expect(guests).toHaveTextContent("Maria Garcia");
    expect(guests).toHaveTextContent("Tom Nguyen");
    expect(document.querySelector("[data-element-type]")).toBeNull();
    expect(document.querySelectorAll("[data-rialto-seam-fallback]")).toHaveLength(0);
  });
});
