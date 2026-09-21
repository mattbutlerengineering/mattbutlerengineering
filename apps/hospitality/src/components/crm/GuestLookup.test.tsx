import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { Guest } from "@mbe/types";
import type { UseGuestLookupParams, UseGuestLookupResult } from "../../hooks/useGuestLookup.js";
import { formatGuestRowDetail } from "./guest-lookup-rows.js";
import { GuestLookup } from "./GuestLookup.js";

const mockUseGuestLookup = vi.fn<(params: UseGuestLookupParams) => UseGuestLookupResult>();

vi.mock("../../hooks/useGuestLookup.js", () => ({
  useGuestLookup: (params: UseGuestLookupParams) => mockUseGuestLookup(params),
}));

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "gst_priya",
    venueId: "venue-1",
    name: "Priya Shah",
    email: "priya@example.com",
    phone: "(555) 010-0100",
    notes: null,
    visitCount: 12,
    noShowCount: 1,
    riskScore: "risky",
    lifetimeSpend: "1200.00",
    lastVisit: "2026-04-01T00:00:00.000Z",
    tags: ["vip"],
    dietaryRestrictions: ["shellfish"],
    staffNotes: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

const priya = makeGuest();
const priyanka = makeGuest({
  id: "gst_priyanka",
  name: "Priyanka Rao",
  email: null,
  phone: "(555) 010-2222",
  visitCount: 0,
  noShowCount: 0,
  tags: null,
  dietaryRestrictions: null,
});

const sixGuests = Array.from({ length: 6 }, (_, i) =>
  makeGuest({ id: `gst_${i}`, name: `Guest ${i}` })
);

const idle: UseGuestLookupResult = {
  rows: [],
  hasMore: false,
  isLoading: false,
  failed: false,
  query: "",
};

const LOADING = "Looking up guests…";
const NO_MATCH = "No returning guest matches. Carry on as usual.";
const MORE = "More matches — keep typing to narrow.";
const FAILURE = "Can't look up guests right now — type the details as usual.";
const HINT = "Name, email or phone — returning guests appear as you type.";

interface HarnessProps {
  picked?: Guest | null;
  initialName?: string;
  onPick?: (guest: Guest) => void;
  onClear?: () => void;
  announce?: (text: string) => void;
  "data-testid"?: string;
}

/** The surface contract in miniature: `register` bag in, `watch` value out, `setValue` on a pick. */
function Harness({
  picked = null,
  initialName = "",
  onPick = () => {},
  onClear = () => {},
  announce = () => {},
  ...rest
}: HarnessProps) {
  const { register, watch, setValue } = useForm<{ guestName: string }>({
    defaultValues: { guestName: initialName },
  });
  return (
    <GuestLookup
      venueId="venue-1"
      label="Guest Name"
      hint={HINT}
      placeholder="e.g. Smith"
      query={watch("guestName")}
      picked={picked}
      onPick={(guest) => {
        setValue("guestName", guest.name);
        onPick(guest);
      }}
      onClear={onClear}
      announce={announce}
      {...register("guestName", { required: "Guest name is required." })}
      {...rest}
    />
  );
}

function combobox() {
  return screen.getByRole("combobox", { name: /guest name/i });
}

/** Type into the field — the change event is what opens the listbox. */
function type(value: string) {
  fireEvent.change(combobox(), { target: { value } });
}

function disabledOptions() {
  return screen.getAllByRole("option").filter((o) => o.getAttribute("aria-disabled") === "true");
}

describe("GuestLookup", () => {
  beforeEach(() => {
    mockUseGuestLookup.mockReset();
    mockUseGuestLookup.mockReturnValue(idle);
  });

  it("renders no listbox under the 2-character minimum", () => {
    render(<Harness />);
    type("p");
    expect(mockUseGuestLookup).toHaveBeenLastCalledWith({ venueId: "venue-1", text: "p" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
  });

  it("wires the combobox pattern onto the input and forwards data-testid", () => {
    render(<Harness data-testid="guest-lookup-input" />);
    const input = screen.getByTestId("guest-lookup-input");
    expect(input).toBe(combobox());
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-haspopup", "listbox");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("name", "guestName");
    expect(input).toHaveAttribute("aria-controls");
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("opens a portaled listbox of two-line rows once rows arrive", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, rows: [priya, priyanka], query: "pri" });
    render(<Harness />);
    type("pri");
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "Guest suggestions" });
    expect(listbox.parentElement).toBe(document.body);
    expect(combobox()).toHaveAttribute("aria-controls", listbox.id);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Priya Shah");
    expect(options[0]).toHaveTextContent(formatGuestRowDetail(priya));
    expect(options[1]).toHaveTextContent("Priyanka Rao");
    expect(options[1]).toHaveTextContent(formatGuestRowDetail(priyanka));
    expect(options[0]).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("status")).toHaveTextContent("2 results available");
  });

  it("picks the highlighted row on ArrowDown + Enter and leaves only the name in the field", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, rows: [priya, priyanka], query: "pri" });
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    type("pri");
    const input = combobox();
    expect(input).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = screen.getAllByRole("option")[0] as HTMLElement;
    expect(input).toHaveAttribute("aria-activedescendant", first.id);
    expect(first).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(priya);
    expect(input).toHaveValue("Priya Shah");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("navigates with ArrowUp, Home and End without wrapping", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, rows: [priya, priyanka], query: "pri" });
    render(<Harness />);
    type("pri");
    const input = combobox();
    const [first, second] = screen.getAllByRole("option") as HTMLElement[];
    fireEvent.keyDown(input, { key: "End" });
    expect(input).toHaveAttribute("aria-activedescendant", second!.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", second!.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute("aria-activedescendant", first!.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute("aria-activedescendant", first!.id);
    fireEvent.keyDown(input, { key: "End" });
    fireEvent.keyDown(input, { key: "Home" });
    expect(input).toHaveAttribute("aria-activedescendant", first!.id);
  });

  it("picks on mouse down without moving focus off the input", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, rows: [priya, priyanka], query: "pri" });
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    type("pri");
    const second = screen.getAllByRole("option")[1] as HTMLElement;
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    fireEvent(second, mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(priyanka);
    expect(combobox()).toHaveValue("Priyanka Rao");
  });

  it("closes on Escape and marks the keydown as consumed so the dialog stays open", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, rows: [priya], query: "pri" });
    render(<Harness />);
    type("pri");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(combobox(), escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
  });

  it("lets an Escape through untouched when no listbox is showing", () => {
    render(<Harness />);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(combobox(), escape);
    expect(escape.defaultPrevented).toBe(false);
  });

  it("closes on blur and on Tab without picking", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, rows: [priya], query: "pri" });
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    type("pri");
    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    fireEvent.blur(combobox());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();

    type("priy");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(combobox(), { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("calls onClear once when the field is emptied while a guest is picked", () => {
    const onClear = vi.fn();
    render(<Harness picked={priya} initialName="Priya Shah" onClear={onClear} />);
    type("Priya Sha");
    expect(onClear).not.toHaveBeenCalled();
    type("");
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("does not look up the picked guest's own name", () => {
    render(<Harness picked={priya} initialName="Priya Shah" />);
    expect(mockUseGuestLookup).toHaveBeenLastCalledWith({ venueId: "venue-1", text: "" });
  });

  it.each([
    ["isLoading", { ...idle, isLoading: true, query: "pri" }, LOADING, 1],
    ["no match", { ...idle, query: "pri" }, NO_MATCH, 1],
    ["hasMore", { ...idle, rows: sixGuests, hasMore: true, query: "pri" }, MORE, 7],
  ] as const)("renders exactly one disabled status row for %s", (_label, result, copy, total) => {
    mockUseGuestLookup.mockReturnValue(result);
    render(<Harness />);
    type("pri");
    expect(screen.getAllByRole("option")).toHaveLength(total);
    const status = disabledOptions();
    expect(status).toHaveLength(1);
    expect(status[0]).toHaveTextContent(copy);
  });

  it("announces loading and no-match from its own polite region", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, isLoading: true, query: "pri" });
    const { rerender } = render(<Harness />);
    type("pri");
    expect(screen.getByRole("status")).toHaveTextContent(LOADING);
    mockUseGuestLookup.mockReturnValue({ ...idle, query: "pri" });
    rerender(<Harness />);
    expect(screen.getByRole("status")).toHaveTextContent(NO_MATCH);
  });

  it("shows the failure caption once per episode, keeps the field usable, and clears it on recovery", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, failed: true, query: "pri" });
    const announce = vi.fn();
    const { rerender } = render(<Harness announce={announce} />);
    type("pri");
    expect(screen.getByText(FAILURE)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox()).not.toBeDisabled();
    expect(combobox().getAttribute("aria-describedby")).toContain(screen.getByText(FAILURE).id);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(FAILURE);

    // The next keystroke retries and fails again — still the same episode, no second announcement.
    mockUseGuestLookup.mockReturnValue({ ...idle, failed: true, query: "priy" });
    type("priy");
    rerender(<Harness announce={announce} />);
    expect(screen.getByText(FAILURE)).toBeInTheDocument();
    expect(announce).toHaveBeenCalledTimes(1);

    // First successful response after a change clears the caption.
    mockUseGuestLookup.mockReturnValue({ ...idle, rows: [priya], query: "priya" });
    type("priya");
    rerender(<Harness announce={announce} />);
    expect(screen.queryByText(FAILURE)).toBeNull();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("clears the failure caption when the field is emptied", () => {
    mockUseGuestLookup.mockReturnValue({ ...idle, failed: true, query: "pri" });
    const { rerender } = render(<Harness />);
    type("pri");
    expect(screen.getByText(FAILURE)).toBeInTheDocument();
    mockUseGuestLookup.mockReturnValue(idle);
    type("");
    rerender(<Harness />);
    expect(screen.queryByText(FAILURE)).toBeNull();
  });
});
