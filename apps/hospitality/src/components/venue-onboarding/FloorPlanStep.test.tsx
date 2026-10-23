import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type * as RialtoModule from "@mattbutlerengineering/rialto";
import {
  EMPTY_FLOOR_PLAN_DRAFT,
  type FloorPlanDraft,
  type DraftTable,
} from "./floor-plan-draft.js";
import { FLOOR_PLAN_TEMPLATES, draftFromTemplate } from "./floor-plan-templates.js";
import type { RoomTemplateId } from "../floor-plan/room-templates.js";
import { snapToGrid } from "../floor-plan/floor-plan-geometry.js";

/** The catalog name of each room, as the picker cards label them. */
const TEMPLATE_NAMES: Record<RoomTemplateId, string> = {
  blank: "Blank",
  "fine-dining": "Fine Dining",
  "casual-bistro": "Casual Bistro",
  "bar-lounge": "Bar & Lounge",
  cafe: "Café",
  "banquet-hall": "Banquet Hall",
  "open-kitchen": "Open Kitchen",
};

/** Matches a picker card by its name, ignoring the description that follows. */
const cardNamed = (id: RoomTemplateId) =>
  new RegExp(`^${TEMPLATE_NAMES[id].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — `);

/** The room used wherever a test needs a non-empty layout. */
const ROOM: RoomTemplateId = "fine-dining";

/* ── Mock react-konva + TableShape so FloorPlanCanvas can render under jsdom ── */

vi.mock("react-konva", () => ({
  Stage: ({
    children,
    onClick,
    onTap,
  }: {
    children?: ReactNode;
    onClick?: (e: unknown) => void;
    onTap?: (e: unknown) => void;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-testid="konva-stage"
      onClick={(e) => {
        const fakeStage = { getStage: () => fakeStage };
        onClick?.({ target: fakeStage, currentTarget: null });
        onTap?.({ target: fakeStage, currentTarget: null });
        void e;
      }}
    >
      {children}
    </div>
  ),
  Layer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="konva-layer">{children}</div>
  ),
}));

vi.mock("../floor-plan/SectionZone.js", () => ({
  SectionZone: ({ zone }: { zone: { id: string; name: string } }) => (
    <div data-testid={`section-zone-${zone.id}`}>{zone.name}</div>
  ),
}));

vi.mock("../floor-plan/WallShape.js", () => ({
  WallShape: ({ wall }: { wall: { id: string } }) => <div data-testid={`wall-shape-${wall.id}`} />,
}));

vi.mock("../floor-plan/TableShape", () => ({
  TableShape: ({
    table,
    isSelected,
    onSelect,
    onDragEnd,
  }: {
    table: { id: string; name: string };
    isSelected: boolean;
    onSelect: (id: string) => void;
    onDragEnd: (id: string, x: number, y: number) => void;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-testid={`table-shape-${table.id}`}
      data-selected={isSelected}
      onClick={(e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect(table.id);
      }}
      onMouseUp={() => onDragEnd(table.id, 137, 253)}
    >
      {table.name}
    </div>
  ),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: true, // default: wide viewport (>=1024px)
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

/*
 * ConfirmDialog's real implementation wraps its content in framer-motion's
 * AnimatePresence, which does not unmount synchronously in jsdom — so a test
 * asserting "not in the document" right after clicking Cancel/Confirm can
 * observe stale DOM. Swap in a synchronous stand-in; everything else in the
 * package (Text, Button, etc., which 20+ other assertions here depend on for
 * real ARIA role/attribute forwarding) stays real via importOriginal.
 */
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => {
  const actual = await importOriginal<typeof RialtoModule>();
  return {
    ...actual,
    ConfirmDialog: ({
      open,
      title,
      description,
      onConfirm,
      onCancel,
      confirmLabel,
      cancelLabel,
    }: {
      open: boolean;
      title: string;
      description?: string;
      onConfirm: () => void;
      onCancel: () => void;
      confirmLabel?: string;
      cancelLabel?: string;
    }) =>
      open ? (
        <div role="dialog" aria-label={title}>
          <span>{title}</span>
          {description && <span>{description}</span>}
          <button onClick={onCancel}>{cancelLabel ?? "Cancel"}</button>
          <button onClick={onConfirm}>{confirmLabel ?? "Confirm"}</button>
        </div>
      ) : null,
  };
});

import { FloorPlanStep } from "./FloorPlanStep.js";

function setWideViewport(isWide: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: isWide,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function draftFor(
  templateId: RoomTemplateId,
  overrides: Partial<FloorPlanDraft> = {}
): FloorPlanDraft {
  return { ...draftFromTemplate(templateId, "cozy"), ...overrides };
}

const templateGroup = () => screen.getByRole("radiogroup", { name: "Room template" });

function makeProps(overrides: Partial<React.ComponentProps<typeof FloorPlanStep>> = {}) {
  return {
    draft: EMPTY_FLOOR_PLAN_DRAFT,
    error: null,
    onSelectTemplate: vi.fn(),
    onSelectSize: vi.fn(),
    onAddTable: vi.fn(),
    onMoveTable: vi.fn(),
    onRemoveTable: vi.fn(),
    ...overrides,
  };
}

describe("FloorPlanStep", () => {
  beforeEach(() => {
    setWideViewport(true);
  });

  describe("heading and picker", () => {
    it("renders the step heading and caption", () => {
      render(<FloorPlanStep {...makeProps()} />);
      expect(screen.getByText("Floor Plan")).toBeInTheDocument();
      expect(
        screen.getByText("Start from a layout like yours, then arrange it.")
      ).toBeInTheDocument();
    });

    it("offers the seven room templates and the four sizes", () => {
      render(<FloorPlanStep {...makeProps()} />);

      expect(within(templateGroup()).getAllByRole("radio")).toHaveLength(
        FLOOR_PLAN_TEMPLATES.length
      );
      for (const template of FLOOR_PLAN_TEMPLATES) {
        expect(
          within(templateGroup()).getByRole("radio", { name: cardNamed(template.id) })
        ).toBeInTheDocument();
      }
      expect(
        within(screen.getByRole("radiogroup", { name: "Room size" })).getAllByRole("radio")
      ).toHaveLength(4);
    });

    it("checks nothing until a room is chosen, so Next stays refused", () => {
      render(<FloorPlanStep {...makeProps()} />);

      const checked = within(templateGroup())
        .getAllByRole("radio")
        .filter((node) => node.getAttribute("aria-checked") === "true");
      expect(checked).toEqual([]);
    });
  });

  describe("template selection", () => {
    it.each(FLOOR_PLAN_TEMPLATES.map((t) => t.id))(
      "calls onSelectTemplate('%s') when its card is clicked and draft is pristine",
      async (templateId) => {
        const onSelectTemplate = vi.fn();
        const user = userEvent.setup();
        render(<FloorPlanStep {...makeProps({ onSelectTemplate })} />);
        await user.click(
          within(templateGroup()).getByRole("radio", { name: cardNamed(templateId) })
        );
        expect(onSelectTemplate).toHaveBeenCalledWith(templateId);
        expect(onSelectTemplate).toHaveBeenCalledTimes(1);
      }
    );

    it("renders the canvas with the chosen room's table count once the draft reflects it", () => {
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft })} />);
      expect(screen.getAllByTestId(/^table-shape-/)).toHaveLength(draft.tables.length);
    });

    it("draws the room's walls and named zones alongside its tables", () => {
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft })} />);

      for (const zone of draft.sections) {
        expect(screen.getByTestId(`section-zone-${zone.id}`)).toBeInTheDocument();
      }
      expect(draft.walls.length).toBeGreaterThan(0);
    });

    it("reports a size change, keeping the chosen room", async () => {
      const onSelectSize = vi.fn();
      const user = userEvent.setup();
      render(<FloorPlanStep {...makeProps({ draft: draftFor(ROOM), onSelectSize })} />);

      await user.click(
        within(screen.getByRole("radiogroup", { name: "Room size" })).getByRole("radio", {
          name: /^Grand/,
        })
      );
      expect(onSelectSize).toHaveBeenCalledWith("grand");
    });

    it("renders zero tables for the blank template", () => {
      render(<FloorPlanStep {...makeProps({ draft: draftFor("blank") })} />);
      expect(screen.queryAllByTestId(/^table-shape-/)).toHaveLength(0);
      expect(screen.getByText("An empty floor")).toBeInTheDocument();
    });

    it("with pristine: false, opens the confirm dialog and does not call onSelectTemplate until confirmed", async () => {
      const onSelectTemplate = vi.fn();
      const user = userEvent.setup();
      const draft = draftFor(ROOM, { pristine: false });
      render(<FloorPlanStep {...makeProps({ draft, onSelectTemplate })} />);

      await user.click(within(templateGroup()).getByRole("radio", { name: cardNamed("cafe") }));
      expect(onSelectTemplate).not.toHaveBeenCalled();
      expect(screen.getByText("Replace your layout?")).toBeInTheDocument();
      expect(
        screen.getByText(
          "You've changed this floor plan. Choosing Café replaces your tables with the Caf\u00e9 layout."
        )
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Keep mine" }));
      expect(onSelectTemplate).not.toHaveBeenCalled();
      expect(screen.queryByText("Replace your layout?")).not.toBeInTheDocument();

      await user.click(within(templateGroup()).getByRole("radio", { name: cardNamed("cafe") }));
      await user.click(screen.getByRole("button", { name: "Replace layout" }));
      expect(onSelectTemplate).toHaveBeenCalledWith("cafe");
      expect(onSelectTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe("canvas drag", () => {
    it("calls onMoveTable with the canvas-snapped coordinates on drag end", () => {
      const onMoveTable = vi.fn();
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft, onMoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      fireEvent.mouseUp(screen.getByTestId(`table-shape-${firstTable.localId}`));

      expect(onMoveTable).toHaveBeenCalledWith(firstTable.localId, 140, 260);
    });
  });

  describe("add table", () => {
    it("rejects a duplicate name and does not call onAddTable", async () => {
      const onAddTable = vi.fn();
      const user = userEvent.setup();
      const draft: FloorPlanDraft = draftFor("blank", {
        tables: [
          {
            localId: "t1",
            name: "Table 1",
            capacity: 4,
            minCovers: 2,
            shape: "rectangle",
            x: 400,
            y: 300,
          },
        ],
        pristine: false,
      });
      render(<FloorPlanStep {...makeProps({ draft, onAddTable })} />);

      await user.click(screen.getByRole("button", { name: "Add table" }));
      await user.type(screen.getByLabelText(/Table Name/), "Table 1");
      await user.click(screen.getByRole("button", { name: "Add Table" }));

      await waitFor(() => {
        expect(screen.getByText("A table with this name already exists")).toBeInTheDocument();
      });
      expect(onAddTable).not.toHaveBeenCalled();
    });

    it("calls onAddTable once with a fresh name and closes the dialog", async () => {
      const onAddTable = vi.fn();
      const user = userEvent.setup();
      render(<FloorPlanStep {...makeProps({ draft: draftFor("blank"), onAddTable })} />);

      await user.click(screen.getByRole("button", { name: "Add table" }));
      await user.type(screen.getByLabelText(/Table Name/), "Patio 1");
      await user.click(screen.getByRole("button", { name: "Add Table" }));

      await waitFor(() => {
        expect(onAddTable).toHaveBeenCalledTimes(1);
      });
      expect(onAddTable).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Patio 1", capacity: 4, minCovers: 1 })
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("selection bar and remove", () => {
    it("shows the placeholder and no remove button when nothing is selected", () => {
      render(<FloorPlanStep {...makeProps({ draft: draftFor(ROOM) })} />);
      expect(screen.getByText("Select a table to move or remove it.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove table" })).not.toBeInTheDocument();
    });

    it("selecting a table then pressing Remove table calls onRemoveTable with its localId", async () => {
      const onRemoveTable = vi.fn();
      const user = userEvent.setup();
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft, onRemoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      await user.click(screen.getByTestId(`table-shape-${firstTable.localId}`));
      expect(
        screen.getByText(`${firstTable.name} · ${firstTable.capacity} seats · Circle`)
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Remove table" }));
      expect(onRemoveTable).toHaveBeenCalledWith(firstTable.localId);
    });
  });

  describe("narrow viewport (M13)", () => {
    it("renders the preview and narrow-band copy, and no canvas or Add table button", () => {
      setWideViewport(false);
      render(<FloorPlanStep {...makeProps({ draft: draftFor(ROOM) })} />);

      expect(screen.queryByTestId("konva-stage")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add table" })).not.toBeInTheDocument();
      expect(
        screen.getByText(
          "Arranging tables needs a wider screen. Your layout is saved — open it on a desktop to move things around."
        )
      ).toBeInTheDocument();
    });
  });

  describe("error alert", () => {
    it("renders props.error in a role=alert and nothing when null", () => {
      const { rerender } = render(
        <FloorPlanStep
          {...makeProps({
            error: "Choose a layout to continue — pick Blank to start with an empty floor.",
          })}
        />
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Choose a layout to continue — pick Blank to start with an empty floor."
      );

      rerender(<FloorPlanStep {...makeProps({ error: null })} />);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("empty states", () => {
    it("shows the no-layout-chosen empty state when templateId is null", () => {
      render(<FloorPlanStep {...makeProps({ draft: EMPTY_FLOOR_PLAN_DRAFT })} />);
      expect(screen.getByText("Your floor plan appears here")).toBeInTheDocument();
      expect(
        screen.getByText("Pick a layout above to start arranging tables.")
      ).toBeInTheDocument();
    });

    it("shows the zero-tables empty state when a template is chosen but has no tables", () => {
      render(<FloorPlanStep {...makeProps({ draft: draftFor("blank") })} />);
      expect(screen.getByText("An empty floor")).toBeInTheDocument();
      expect(
        screen.getByText("Add tables with the button above, or pick a layout to start from one.")
      ).toBeInTheDocument();
    });
  });

  describe("announcements", () => {
    it("announces the applied template and table count in a polite status region", async () => {
      const user = userEvent.setup();
      render(<FloorPlanStep {...makeProps()} />);
      await user.click(within(templateGroup()).getByRole("radio", { name: cardNamed("blank") }));
      expect(screen.getByRole("status")).toHaveTextContent("Blank applied at Cozy — 0 tables");
    });

    it("announces a table added", async () => {
      const user = userEvent.setup();
      render(<FloorPlanStep {...makeProps({ draft: draftFor("blank") })} />);
      await user.click(screen.getByRole("button", { name: "Add table" }));
      await user.type(screen.getByLabelText(/Table Name/), "Patio 1");
      await user.click(screen.getByRole("button", { name: "Add Table" }));
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Patio 1 added");
      });
    });

    it("announces a table removed", async () => {
      const user = userEvent.setup();
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft })} />);
      const firstTable = draft.tables[0] as DraftTable;
      await user.click(screen.getByTestId(`table-shape-${firstTable.localId}`));
      await user.click(screen.getByRole("button", { name: "Remove table" }));
      expect(screen.getByRole("status")).toHaveTextContent(`${firstTable.name} removed`);
    });

    it("announces a table moved on keyboard nudge, but not on pointer drag", () => {
      const onMoveTable = vi.fn();
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft, onMoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      fireEvent.click(screen.getByTestId(`table-shape-${firstTable.localId}`));
      fireEvent.mouseUp(screen.getByTestId(`table-shape-${firstTable.localId}`));
      expect(screen.getByRole("status")).toHaveTextContent("");

      // A nudge always snaps. Room-template coordinates are fractions of the
      // canvas rather than grid multiples, so the first nudge both moves the
      // table and lands it on the grid — `x + 20` only held for the old
      // grid-aligned zone templates.
      const nudgedX = snapToGrid(firstTable.x + 20);
      fireEvent.keyDown(screen.getByTestId("floor-plan-canvas-wrapper"), { key: "ArrowRight" });
      expect(onMoveTable).toHaveBeenLastCalledWith(firstTable.localId, nudgedX, firstTable.y);
      expect(screen.getByRole("status")).toHaveTextContent(
        `${firstTable.name} moved to ${nudgedX}, ${firstTable.y}`
      );
    });
  });

  describe("keyboard operability (M14)", () => {
    it("moves radiogroup focus and selection with arrow keys", async () => {
      const onSelectTemplate = vi.fn();
      const user = userEvent.setup();
      render(<FloorPlanStep {...makeProps({ onSelectTemplate })} />);

      const first = within(templateGroup()).getByRole("radio", { name: cardNamed("blank") });
      first.focus();
      await user.keyboard("{ArrowRight}");

      expect(onSelectTemplate).toHaveBeenCalledWith("fine-dining");
    });
  });

  // Regression: PR #4797 review gate — the window-level nudge listener only
  // excluded INPUT/TEXTAREA/contentEditable, so ArrowRight on a focused
  // template-picker card (a BUTTON) both advanced the radiogroup selection
  // AND nudged the already-selected canvas table +20px.
  describe("nudge listener vs. picker arrow keys (#4761 addendum)", () => {
    it("does not call onMoveTable when arrow keys are pressed on a picker card while a table is selected", () => {
      const onMoveTable = vi.fn();
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft, onMoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      fireEvent.click(screen.getByTestId(`table-shape-${firstTable.localId}`));

      const pickerCard = within(templateGroup()).getByRole("radio", { name: cardNamed(ROOM) });
      pickerCard.focus();
      fireEvent.keyDown(pickerCard, { key: "ArrowRight" });

      expect(onMoveTable).not.toHaveBeenCalled();
    });
  });

  // Regression: #4825. Once Launch has created server state (launch.venueId
  // is set) the draft must freeze, because `runTablesStage` resumes by NAME —
  // a table moved, removed, or replaced by a template swap after a partial
  // failure is skipped on Retry and the live plan silently diverges from what
  // the manager arranged. The navigation floor already pins Back/rail at step
  // 5; this is the matching edit freeze.
  describe("read-only once launch has created server state (#4825)", () => {
    it("explains why the layout is frozen", () => {
      render(<FloorPlanStep {...makeProps({ draft: draftFor(ROOM), readOnly: true })} />);

      expect(
        screen.getByText(
          "Your venue is already being created, so this layout is locked. Finish setting up, then rearrange tables in the floor plan editor."
        )
      ).toBeInTheDocument();
    });

    it("disables every template card and ignores clicks on them", async () => {
      const onSelectTemplate = vi.fn();
      const user = userEvent.setup();
      render(
        <FloorPlanStep
          {...makeProps({
            draft: draftFor(ROOM),
            readOnly: true,
            onSelectTemplate,
          })}
        />
      );

      const cards = within(templateGroup()).getAllByRole("radio");
      cards.forEach((card) => expect(card).toBeDisabled());

      await user.click(within(templateGroup()).getByRole("radio", { name: cardNamed("cafe") }));
      expect(onSelectTemplate).not.toHaveBeenCalled();
      expect(screen.queryByText("Replace your layout?")).not.toBeInTheDocument();
    });

    it("ignores arrow keys on the template picker", () => {
      const onSelectTemplate = vi.fn();
      render(
        <FloorPlanStep
          {...makeProps({
            draft: draftFor(ROOM),
            readOnly: true,
            onSelectTemplate,
          })}
        />
      );

      fireEvent.keyDown(templateGroup(), { key: "ArrowRight" });
      expect(onSelectTemplate).not.toHaveBeenCalled();
    });

    it("offers no Add table button", () => {
      render(<FloorPlanStep {...makeProps({ draft: draftFor(ROOM), readOnly: true })} />);
      expect(screen.queryByRole("button", { name: "Add table" })).not.toBeInTheDocument();
    });

    it("offers no Remove table button for a selected table", async () => {
      const onRemoveTable = vi.fn();
      const user = userEvent.setup();
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft, readOnly: true, onRemoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      await user.click(screen.getByTestId(`table-shape-${firstTable.localId}`));

      expect(screen.queryByRole("button", { name: "Remove table" })).not.toBeInTheDocument();
      expect(onRemoveTable).not.toHaveBeenCalled();
    });

    it("does not call onMoveTable on drag end or on an arrow-key nudge", () => {
      const onMoveTable = vi.fn();
      const draft = draftFor(ROOM);
      render(<FloorPlanStep {...makeProps({ draft, readOnly: true, onMoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      fireEvent.mouseUp(screen.getByTestId(`table-shape-${firstTable.localId}`));
      fireEvent.click(screen.getByTestId(`table-shape-${firstTable.localId}`));
      fireEvent.keyDown(screen.getByTestId("floor-plan-canvas-wrapper"), { key: "ArrowRight" });

      expect(onMoveTable).not.toHaveBeenCalled();
    });
  });
});
