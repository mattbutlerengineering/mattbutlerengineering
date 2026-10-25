import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { RialtoLocaleProvider } from "../../i18n/RialtoLocaleProvider";
import { esMX } from "../../i18n/locales/es-MX";
import { TimeSlots } from "./TimeSlots";

const times = ["5:30 PM", "6:00 PM", "6:15 PM", "7:45 PM", "8:00 PM"];

describe("TimeSlots", () => {
  it("reads the date line as {date} · {party size in words}", () => {
    render(<TimeSlots date="Friday, Oct 30" partySize={4} times={times} />);
    expect(screen.getByText("Friday, Oct 30 · Party of 4")).toBeInTheDocument();
  });

  it("lists the open times in order, one item each, named by the locale message", () => {
    render(<TimeSlots date="Friday, Oct 30" partySize={4} times={times} />);
    const list = screen.getByRole("list", { name: "Open times" });
    expect(list.tagName).toBe("UL");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(times);
  });

  it("shows each time as a static Tag-look label in a wrapping row", () => {
    const { container } = render(<TimeSlots date="Friday" partySize={2} times={times} />);
    const list = screen.getByRole("list", { name: "Open times" });
    expect(list.className).toMatch(/times/);
    expect(within(list).getByText("6:00 PM").className).toMatch(/tag/);
    expect(container.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
  });

  it("shows 24-hour HH:mm times in the locale's clock", () => {
    render(<TimeSlots date="Monday" partySize={2} times={["09:00", "20:30"]} />);
    const items = within(screen.getByRole("list", { name: "Open times" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^9:00\sAM$/),
      expect.stringMatching(/^8:30\sPM$/),
    ]);
  });

  it("shows the localized no-open-times line for an empty times array, never an empty box", () => {
    render(<TimeSlots date="Saturday, Oct 31" partySize={6} times={[]} />);
    expect(screen.getByText("Saturday, Oct 31 · Party of 6")).toBeInTheDocument();
    expect(screen.getByText("No open times")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("uses the active locale's words", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <TimeSlots date="viernes 30" partySize={4} times={["19:30"]} />
        <TimeSlots date="sábado 31" partySize={2} times={[]} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByText(`viernes 30 · ${esMX.partyOf(4)}`)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: esMX.openTimes })).toHaveTextContent(
      /^7:30\s?p\.?\s?m\.?$/
    );
    expect(screen.getByText(esMX.noOpenTimes)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<TimeSlots date="Friday" partySize={4} times={times} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
