/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfirmationView } from "./ConfirmationView.js";
import { Stack, Text } from "@mattbutlerengineering/rialto";
import enUS from "../../i18n/catalogs/en-US.json";

const contactLine = (contact: string) =>
  enUS.bookingWidget.confirmation.contactLine.replace("{{contact}}", contact);
import {
  EMPTY_NOTES,
  TWO_LINE_DISPLAYED,
  TWO_LINE_NOTE,
  UNTRUSTED_NOTE,
} from "../../test/special-requests-fixtures.js";
import type { Reservation, PublicVenueConfig } from "@mbe/types";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => {
  // Keep the attributes group/heading assertions read; drop presentational props.
  const forwarded = (props: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(props).filter(
        ([key]) => ["id", "dir", "className", "role"].includes(key) || key.startsWith("aria-")
      )
    );
  return {
    Button: ({
      children,
      onClick,
      variant,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      variant?: string;
    }) => (
      <button onClick={onClick} data-variant={variant}>
        {children}
      </button>
    ),
    Text: ({
      children,
      as: Tag = "span",
      ...props
    }: { children?: React.ReactNode; as?: React.ElementType } & Record<string, unknown>) => (
      <Tag {...forwarded(props)}>{children}</Tag>
    ),
    Stack: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
      <div {...forwarded(props)}>{children}</div>
    ),
  };
});

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-abcd1234",
    date: "2026-05-20",
    startTime: "2026-05-20T18:00:00",
    endTime: "2026-05-20T20:00:00",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "John Doe",
    guestEmail: "john@example.com",
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table-1",
    venueId: "venue-1",
    createdAt: "2026-05-20T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
    ...overrides,
  };
}

function makeVenueConfig(overrides: Partial<PublicVenueConfig> = {}): PublicVenueConfig {
  return {
    name: "The Rialto Grill",
    slug: "the-rialto-grill",
    ianaTimezone: "America/New_York",
    currencyCode: "usd",
    operatingHours: null,
    settings: {},
    deposit: {
      enabled: false,
      depositType: null,
      amountCents: null,
      freeCancellationHours: null,
      lateCancellationFeePercent: null,
      noShowFeePercent: null,
    },
    ...overrides,
  };
}

describe("ConfirmationView", () => {
  const mockOnNewBooking = vi.fn();

  it("renders reservation confirmed heading", () => {
    render(<ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />);
    expect(screen.getByText("Reservation Confirmed!")).toBeDefined();
  });

  it("displays the confirmation number from the reservation id", () => {
    render(<ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />);
    // Last 8 chars of "res-abcd1234" uppercased = "BCD1234" ... actually "ABCD1234"
    expect(screen.getByText("ABCD1234")).toBeDefined();
  });

  it("displays the reservation time in the venue's timezone, not the device's (#4976)", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      // 18:00Z on 2026-05-20 is 2:00 PM in New York (EDT, UTC-4) but
      // 11:00 AM on a Los Angeles device (PDT, UTC-7).
      const reservation = makeReservation({ startTime: "2026-05-20T18:00:00Z" });
      render(
        <ConfirmationView
          reservation={reservation}
          onNewBooking={mockOnNewBooking}
          venueTimezone="America/New_York"
        />
      );
      expect(screen.getByText("2:00 PM")).toBeDefined();
      expect(screen.queryByText("11:00 AM")).toBeNull();
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("falls back to venueConfig.ianaTimezone when venueTimezone prop is omitted", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const reservation = makeReservation({ startTime: "2026-05-20T18:00:00Z" });
      render(
        <ConfirmationView
          reservation={reservation}
          onNewBooking={mockOnNewBooking}
          venueConfig={makeVenueConfig({ ianaTimezone: "America/New_York" })}
        />
      );
      expect(screen.getByText("2:00 PM")).toBeDefined();
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("displays party size with correct pluralization", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ partySize: 4 })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.getByText("4 guests")).toBeDefined();
  });

  it("uses singular 'guest' for party size of 1", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ partySize: 1 })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.getByText("1 guest")).toBeDefined();
  });

  it("displays guest name when present", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestName: "Jane Smith" })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.getByText("Jane Smith")).toBeDefined();
  });

  it("does not display name row when guestName is null", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestName: null })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.queryByText("Name")).toBeNull();
  });

  it("tells the truth about sends, naming the email, when guestEmail exists", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestEmail: "john@example.com" })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.getByText(contactLine("john@example.com"))).toBeDefined();
    expect(screen.queryByText(/A confirmation has been sent/)).toBeNull();
  });

  it("tells the truth about sends, naming the phone, when only guestPhone exists", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestEmail: null, guestPhone: "+15551234" })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.getByText(contactLine("+15551234"))).toBeDefined();
    expect(screen.queryByText(/A confirmation has been sent/)).toBeNull();
  });

  it("names the email when both an email and a phone exist", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestEmail: "john@example.com", guestPhone: "+15551234" })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.getByText(contactLine("john@example.com"))).toBeDefined();
    expect(screen.queryByText(/A confirmation has been sent/)).toBeNull();
  });

  it("no contact line when there is neither an email nor a phone", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestEmail: null, guestPhone: null })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.queryByText(/^No confirmation email or text is sent/)).toBeNull();
    expect(screen.queryByText(/A confirmation has been sent/)).toBeNull();
  });

  it("breaks an overlong contact anywhere (CSS text)", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/components/booking-widget/ConfirmationView.module.css"),
      "utf-8"
    );
    const rule = css.match(/\.contactLine\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/overflow-wrap:\s*anywhere;/);
  });

  it("calls onNewBooking when 'Make Another Reservation' is clicked", () => {
    render(<ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />);
    fireEvent.click(screen.getByText("Make Another Reservation"));
    expect(mockOnNewBooking).toHaveBeenCalled();
  });

  it("navigates to cancellationUrl when provided", () => {
    const originalLocation = window.location.href;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: originalLocation },
    });

    render(
      <ConfirmationView
        reservation={makeReservation()}
        onNewBooking={mockOnNewBooking}
        cancellationUrl="https://example.com/cancel"
      />
    );
    fireEvent.click(screen.getByText("Cancel Reservation"));
    expect(window.location.href).toBe("https://example.com/cancel");
  });

  it("does not show the cancel button when cancellationUrl is not provided (#4978)", () => {
    render(<ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />);
    expect(screen.queryByText("Cancel Reservation")).toBeNull();
  });

  it("displays table info when reservation has a table", () => {
    const resWithTable = {
      ...makeReservation(),
      table: { id: "t1", name: "Patio 1", tableNumber: "T1" },
    } as any;

    render(<ConfirmationView reservation={resWithTable} onNewBooking={mockOnNewBooking} />);
    expect(screen.getByText("T1")).toBeDefined();
  });

  it("uses table name as fallback when tableNumber is not available", () => {
    const resWithTable = {
      ...makeReservation(),
      table: { id: "t1", name: "Patio Corner", tableNumber: "" },
    } as any;

    render(<ConfirmationView reservation={resWithTable} onNewBooking={mockOnNewBooking} />);
    expect(screen.getByText("Patio Corner")).toBeDefined();
  });

  describe("Add to calendar", () => {
    it("does not render the section when venueConfig is not provided", () => {
      render(<ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />);
      expect(screen.queryByText("Add to Calendar")).toBeNull();
    });

    it("renders download and deep-link actions when venueConfig is provided", () => {
      render(
        <ConfirmationView
          reservation={makeReservation()}
          onNewBooking={mockOnNewBooking}
          venueConfig={makeVenueConfig()}
        />
      );
      expect(screen.getByText("Add to Calendar")).toBeDefined();
      expect(screen.getByText("Download .ics")).toBeDefined();
      expect(screen.getByText("Google Calendar")).toBeDefined();
      expect(screen.getByText("Outlook")).toBeDefined();
    });

    it("Google Calendar link opens calendar.google.com in a new tab safely", () => {
      render(
        <ConfirmationView
          reservation={makeReservation()}
          onNewBooking={mockOnNewBooking}
          venueConfig={makeVenueConfig()}
        />
      );
      const link = screen.getByText("Google Calendar").closest("a");
      expect(link?.getAttribute("href")).toContain("https://calendar.google.com/calendar/render");
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("Outlook link opens outlook.live.com in a new tab safely", () => {
      render(
        <ConfirmationView
          reservation={makeReservation()}
          onNewBooking={mockOnNewBooking}
          venueConfig={makeVenueConfig()}
        />
      );
      const link = screen.getByText("Outlook").closest("a");
      expect(link?.getAttribute("href")).toContain(
        "https://outlook.live.com/calendar/0/deeplink/compose"
      );
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("'Download .ics' builds a blob client-side and triggers a real file download", () => {
      const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      const revokeObjectURL = vi.fn();
      window.URL.createObjectURL = createObjectURL;
      window.URL.revokeObjectURL = revokeObjectURL;
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      render(
        <ConfirmationView
          reservation={makeReservation()}
          onNewBooking={mockOnNewBooking}
          venueConfig={makeVenueConfig()}
        />
      );
      fireEvent.click(screen.getByText("Download .ics"));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg = createObjectURL.mock.calls[0]?.[0];
      expect(blobArg).toBeInstanceOf(Blob);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

      clickSpy.mockRestore();
    });
  });
});

describe("ConfirmationView Special Requests card", () => {
  const onNewBooking = vi.fn();
  const label = enUS.bookingWidget.specialRequests.label;

  function renderWithNotes(notes: string | null, extra: { depositAmountCents?: number } = {}) {
    return render(
      <ConfirmationView
        reservation={makeReservation({ notes })}
        onNewBooking={onNewBooking}
        {...extra}
      />
    );
  }

  function wordsOf(group: HTMLElement): HTMLElement {
    const words = group.querySelector<HTMLElement>('[dir="auto"]');
    if (!words) throw new Error("no words element in the Special Requests group");
    return words;
  }

  it("names the group by its h3 and says the acknowledgement", () => {
    renderWithNotes(TWO_LINE_NOTE);
    const group = screen.getByRole("group", { name: label });
    expect(within(group).getByRole("heading", { level: 3, name: label })).toBeDefined();
    expect(
      within(group).getByText(enUS.bookingWidget.specialRequests.acknowledgement)
    ).toBeDefined();
  });

  it("renders the guest's words as one text node, line break kept, dir=auto", () => {
    renderWithNotes(TWO_LINE_NOTE);
    const words = wordsOf(screen.getByRole("group", { name: label }));
    expect(words.childNodes).toHaveLength(1);
    expect(words.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(words.firstChild?.nodeValue).toBe(TWO_LINE_DISPLAYED);
    expect(words.getAttribute("dir")).toBe("auto");
    expect(words.className).toBe("requestsText");
  });

  it("sits after Reservation Details and before the Deposit card", () => {
    renderWithNotes(TWO_LINE_NOTE, { depositAmountCents: 5000 });
    const group = screen.getByRole("group", { name: label });
    const details = screen.getByRole("heading", { name: "Reservation Details" });
    const deposit = screen.getByRole("heading", { name: "Deposit" });
    expect(details.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(deposit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(EMPTY_NOTES)("renders no block, label, line or card for %j", (notes) => {
    const withNotes = renderWithNotes(TWO_LINE_NOTE);
    const present = withNotes.container.querySelectorAll(".detailsCard").length;
    withNotes.unmount();
    const { container } = renderWithNotes(notes);
    expect(screen.queryByRole("group", { name: label })).toBeNull();
    expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(enUS.bookingWidget.specialRequests.acknowledgement)).toBeNull();
    expect(container.querySelectorAll(".detailsCard")).toHaveLength(present - 1);
  });

  it("keeps untrusted text as literal characters", () => {
    renderWithNotes(UNTRUSTED_NOTE);
    const group = screen.getByRole("group", { name: label });
    const words = wordsOf(group);
    expect(words.childNodes).toHaveLength(1);
    expect(words.firstChild?.nodeValue).toBe(UNTRUSTED_NOTE);
    expect(group.querySelector("script, a")).toBeNull();
  });

  it("is never inside or around a live region", () => {
    renderWithNotes(TWO_LINE_NOTE);
    const group = screen.getByRole("group", { name: label });
    expect(group.closest("[aria-live]")).toBeNull();
    expect(group.querySelector("[aria-live]")).toBeNull();
  });

  it("wraps the words with keyword values only (CSS text)", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/components/booking-widget/ConfirmationView.module.css"),
      "utf-8"
    );
    const rule = css.match(/\.requestsText\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/white-space:\s*pre-wrap;/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere;/);
    const values = [...rule.matchAll(/:\s*([^;]+);/g)].map((m) => (m[1] ?? "").trim());
    expect(values.every((v) => /^var\(--rialto-[a-z0-9-]+\)$/.test(v) || /^[a-z-]+$/.test(v))).toBe(
      true
    );
  });
});

describe("rialto stub (test infrastructure)", () => {
  it("forwards role, aria-* and id, and honours as, so group names resolve", () => {
    render(
      <Stack role="group" aria-labelledby="t">
        <Text id="t" as="h3">
          Probe
        </Text>
      </Stack>
    );
    expect(screen.getByRole("group", { name: "Probe" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 3, name: "Probe" })).toBeDefined();
  });
});
