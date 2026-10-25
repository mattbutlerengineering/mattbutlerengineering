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
    expect(screen.getByRole("img", { name: "Patio 2: free" })).toBeInTheDocument();
    expect(screen.getByText("Garcia, party of 4")).toBeInTheDocument();
    expect(screen.getByText("Gluten-free")).toBeInTheDocument();
    expect(document.querySelector("[data-element-type]")).toBeNull();
    expect(document.querySelector("[data-rialto-seam-fallback]")).toBeNull();
  });
});
