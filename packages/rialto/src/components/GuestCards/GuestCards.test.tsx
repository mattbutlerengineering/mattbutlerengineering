import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { RialtoLocaleProvider } from "../../i18n/RialtoLocaleProvider";
import { esMX } from "../../i18n/locales/es-MX";
import { GuestCards, type GuestCard } from "./GuestCards";

const guests: GuestCard[] = [
  { name: "Maria Garcia", visits: 12, risk: "trusted", tags: ["VIP", "Regular", "Gluten-free"] },
  { name: "Tom Nguyen", visits: 1, risk: "STANDARD" },
  { name: "Ana Ruiz", visits: 3, risk: "risky", tags: [] },
];

describe("GuestCards", () => {
  it("is a list named by the locale message, one card per guest", () => {
    render(<GuestCards guests={guests} />);
    const list = screen.getByRole("list", { name: "Guests" });
    expect(list.tagName).toBe("UL");
    const cards = list.querySelectorAll(":scope > li");
    expect(cards).toHaveLength(3);
  });

  it("shows the name in the display face", () => {
    render(<GuestCards guests={guests} />);
    expect(screen.getByText("Maria Garcia").className).toMatch(/name/);
  });

  it("puts the localized visit count and the risk word on one line", () => {
    render(<GuestCards guests={guests} />);
    const [first, second] = screen
      .getByRole("list", { name: "Guests" })
      .querySelectorAll(":scope > li");
    const firstLine = within(first as HTMLElement).getByText("12 visits").parentElement;
    expect(firstLine).toHaveTextContent("12 visits · Trusted");
    const secondLine = within(second as HTMLElement).getByText("1 visit").parentElement;
    expect(secondLine).toHaveTextContent("1 visit · Standard");
  });

  it("shows the risk word in its Badge tone, and an unknown risk verbatim in neutral", () => {
    render(<GuestCards guests={[...guests, { name: "Lee", visits: 2, risk: "Watch list" }]} />);
    expect(screen.getByText("Trusted").className).toMatch(/neutral/);
    expect(screen.getByText("Standard").className).toMatch(/warning/);
    expect(screen.getByText("Risky").className).toMatch(/error/);
    expect(screen.getByText("Watch list").className).toMatch(/neutral/);
  });

  it("shows tags in a wrapping row and leaves the row out when there are none", () => {
    render(<GuestCards guests={guests} />);
    const cards = screen.getByRole("list", { name: "Guests" }).querySelectorAll(":scope > li");
    const tags = within(cards[0] as HTMLElement).getByRole("list");
    expect(tags.className).toMatch(/tags/);
    expect(
      within(tags)
        .getAllByRole("listitem")
        .map((t) => t.textContent)
    ).toEqual(["VIP", "Regular", "Gluten-free"]);
    expect(within(cards[1] as HTMLElement).queryByRole("list")).toBeNull();
    expect(within(cards[2] as HTMLElement).queryByRole("list")).toBeNull();
  });

  it("never renders email, phone, notes or spend, even when given them", () => {
    const leaky = {
      name: "Maria Garcia",
      visits: 12,
      risk: "trusted",
      email: "maria@example.com",
      phone: "555-0100",
      notes: "Prefers the window",
      spend: "$4,200",
    } as GuestCard;
    const { container } = render(<GuestCards guests={[leaky]} />);
    for (const word of ["maria@example.com", "555-0100", "Prefers the window", "$4,200"]) {
      expect(container.textContent).not.toContain(word);
    }
  });

  it("separates cards by spacing, not nested boxes", () => {
    render(<GuestCards guests={guests} />);
    const list = screen.getByRole("list", { name: "Guests" });
    expect(list.className).toMatch(/list/);
    for (const card of list.querySelectorAll(":scope > li")) {
      expect(card.className).toMatch(/card/);
      expect(card.querySelector("[class*='Card'], [class*='surface']")).toBeNull();
    }
  });

  it("uses the active locale's words", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <GuestCards guests={[{ name: "María", visits: 4, risk: "risky" }]} />
      </RialtoLocaleProvider>
    );
    const list = screen.getByRole("list", { name: esMX.guests });
    expect(list).toHaveTextContent(esMX.visitCount(4));
    expect(list).toHaveTextContent(esMX.guestRisk.risky);
  });

  it("has nothing focusable", () => {
    const { container } = render(<GuestCards guests={guests} />);
    expect(container.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
  });

  it("has no axe violations", async () => {
    const { container } = render(<GuestCards guests={guests} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
