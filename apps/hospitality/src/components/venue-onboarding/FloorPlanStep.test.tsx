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
import { FLOOR_PLAN_TEMPLATES, tablesForTemplate, templateById } from "./floor-plan-templates.js";

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

function draftFromTemplate(
  templateId: string,
  overrides: Partial<FloorPlanDraft> = {}
): FloorPlanDraft {
  const template = templateById(templateId as Parameters<typeof templateById>[0]);
  return {
    templateId,
    planName: template.planName,
    tables: tablesForTemplate(template),
    pristine: true,
    ...overrides,
  };
}

function makeProps(overrides: Partial<React.ComponentProps<typeof FloorPlanStep>> = {}) {
  return {
    draft: EMPTY_FLOOR_PLAN_DRAFT,
    error: null,
    onSelectTemplate: vi.fn(),
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

    it("renders a radiogroup with five cards labelled per template", () => {
      render(<FloorPlanStep {...makeProps()} />);
      const group = screen.getByRole("radiogroup", { name: "Floor plan layout" });
      const radios = within(group).getAllByRole("radio");
      expect(radios).toHaveLength(5);

      const restaurant = tablesForTemplate(templateById("restaurant"));
      const seats = restaurant.reduce((sum, t) => sum + t.capacity, 0);
      expect(
        within(group).getByRole("radio", {
          name: `Restaurant — ${restaurant.length} tables, ${seats} seats`,
        })
      ).toBeInTheDocument();
      expect(within(group).getByRole("radio", { name: "Blank — no tables" })).toBeInTheDocument();
    });
  });

  describe("template selection", () => {
    it.each(FLOOR_PLAN_TEMPLATES.map((t) => t.id))(
      "calls onSelectTemplate('%s') when its card is clicked and draft is pristine",
      async (templateId) => {
        const onSelectTemplate = vi.fn();
        const user = userEvent.setup();
        render(<FloorPlanStep {...makeProps({ onSelectTemplate })} />);
        const template = templateById(templateId);
        const tables = tablesForTemplate(template);
        const seats = tables.reduce((sum, t) => sum + t.capacity, 0);
        const name =
          template.id === "blank"
            ? "Blank — no tables"
            : `${template.name} — ${tables.length} tables, ${seats} seats`;
        await user.click(screen.getByRole("radio", { name }));
        expect(onSelectTemplate).toHaveBeenCalledWith(templateId);
        expect(onSelectTemplate).toHaveBeenCalledTimes(1);
      }
    );

    it("renders the canvas with the chosen template's table count once the draft reflects it", () => {
      render(<FloorPlanStep {...makeProps({ draft: draftFromTemplate("restaurant") })} />);
      expect(screen.getAllByTestId(/^table-shape-/)).toHaveLength(14);
    });

    it("renders zero tables for the blank template", () => {
      render(<FloorPlanStep {...makeProps({ draft: draftFromTemplate("blank") })} />);
      expect(screen.queryAllByTestId(/^table-shape-/)).toHaveLength(0);
      expect(screen.getByText("An empty floor")).toBeInTheDocument();
    });

    it("with pristine: false, opens the confirm dialog and does not call onSelectTemplate until confirmed", async () => {
      const onSelectTemplate = vi.fn();
      const user = userEvent.setup();
      const draft = draftFromTemplate("restaurant", { pristine: false });
      render(<FloorPlanStep {...makeProps({ draft, onSelectTemplate })} />);

      await user.click(screen.getByRole("radio", { name: /^Cafe/ }));
      expect(onSelectTemplate).not.toHaveBeenCalled();
      expect(screen.getByText("Replace your layout?")).toBeInTheDocument();
      expect(
        screen.getByText(
          "You've changed this floor plan. Choosing Cafe replaces your tables with the Cafe layout."
        )
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Keep mine" }));
      expect(onSelectTemplate).not.toHaveBeenCalled();
      expect(screen.queryByText("Replace your layout?")).not.toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: /^Cafe/ }));
      await user.click(screen.getByRole("button", { name: "Replace layout" }));
      expect(onSelectTemplate).toHaveBeenCalledWith("cafe");
      expect(onSelectTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe("canvas drag", () => {
    it("calls onMoveTable with the canvas-snapped coordinates on drag end", () => {
      const onMoveTable = vi.fn();
      const draft = draftFromTemplate("restaurant");
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
      const draft: FloorPlanDraft = {
        templateId: "blank",
        planName: "Main Floor",
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
      };
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
      render(<FloorPlanStep {...makeProps({ draft: draftFromTemplate("blank"), onAddTable })} />);

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
      render(<FloorPlanStep {...makeProps({ draft: draftFromTemplate("restaurant") })} />);
      expect(screen.getByText("Select a table to move or remove it.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove table" })).not.toBeInTheDocument();
    });

    it("selecting a table then pressing Remove table calls onRemoveTable with its localId", async () => {
      const onRemoveTable = vi.fn();
      const user = userEvent.setup();
      const draft = draftFromTemplate("restaurant");
      render(<FloorPlanStep {...makeProps({ draft, onRemoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      await user.click(screen.getByTestId(`table-shape-${firstTable.localId}`));
      expect(
        screen.getByText(`${firstTable.name} · ${firstTable.capacity} seats · Square`)
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Remove table" }));
      expect(onRemoveTable).toHaveBeenCalledWith(firstTable.localId);
    });
  });

  describe("narrow viewport (M13)", () => {
    it("renders the preview and narrow-band copy, and no canvas or Add table button", () => {
      setWideViewport(false);
      render(<FloorPlanStep {...makeProps({ draft: draftFromTemplate("restaurant") })} />);

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
      render(<FloorPlanStep {...makeProps({ draft: draftFromTemplate("blank") })} />);
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
      await user.click(screen.getByRole("radio", { name: "Blank — no tables" }));
      expect(screen.getByRole("status")).toHaveTextContent("Blank layout applied — 0 tables");
    });

    it("announces a table added", async () => {
      const user = userEvent.setup();
      render(<FloorPlanStep {...makeProps({ draft: draftFromTemplate("blank") })} />);
      await user.click(screen.getByRole("button", { name: "Add table" }));
      await user.type(screen.getByLabelText(/Table Name/), "Patio 1");
      await user.click(screen.getByRole("button", { name: "Add Table" }));
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Patio 1 added");
      });
    });

    it("announces a table removed", async () => {
      const user = userEvent.setup();
      const draft = draftFromTemplate("restaurant");
      render(<FloorPlanStep {...makeProps({ draft })} />);
      const firstTable = draft.tables[0] as DraftTable;
      await user.click(screen.getByTestId(`table-shape-${firstTable.localId}`));
      await user.click(screen.getByRole("button", { name: "Remove table" }));
      expect(screen.getByRole("status")).toHaveTextContent(`${firstTable.name} removed`);
    });

    it("announces a table moved on keyboard nudge, but not on pointer drag", () => {
      const onMoveTable = vi.fn();
      const draft = draftFromTemplate("restaurant");
      render(<FloorPlanStep {...makeProps({ draft, onMoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      fireEvent.click(screen.getByTestId(`table-shape-${firstTable.localId}`));
      fireEvent.mouseUp(screen.getByTestId(`table-shape-${firstTable.localId}`));
      expect(screen.getByRole("status")).toHaveTextContent("");

      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(onMoveTable).toHaveBeenLastCalledWith(
        firstTable.localId,
        firstTable.x + 20,
        firstTable.y
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        `${firstTable.name} moved to ${firstTable.x + 20}, ${firstTable.y}`
      );
    });
  });

  describe("keyboard operability (M14)", () => {
    it("moves radiogroup focus and selection with arrow keys", async () => {
      const onSelectTemplate = vi.fn();
      const user = userEvent.setup();
      render(<FloorPlanStep {...makeProps({ onSelectTemplate })} />);

      const first = screen.getByRole("radio", { name: /^Restaurant/ });
      first.focus();
      await user.keyboard("{ArrowRight}");

      expect(onSelectTemplate).toHaveBeenCalledWith("cafe");
    });
  });

  // Regression: PR #4797 review gate — the window-level nudge listener only
  // excluded INPUT/TEXTAREA/contentEditable, so ArrowRight on a focused
  // template-picker card (a BUTTON) both advanced the radiogroup selection
  // AND nudged the already-selected canvas table +20px.
  describe("nudge listener vs. picker arrow keys (#4761 addendum)", () => {
    it("does not call onMoveTable when arrow keys are pressed on a picker card while a table is selected", () => {
      const onMoveTable = vi.fn();
      const draft = draftFromTemplate("restaurant");
      render(<FloorPlanStep {...makeProps({ draft, onMoveTable })} />);

      const firstTable = draft.tables[0] as DraftTable;
      fireEvent.click(screen.getByTestId(`table-shape-${firstTable.localId}`));

      const pickerCard = screen.getByRole("radio", { name: /^Restaurant/ });
      pickerCard.focus();
      fireEvent.keyDown(pickerCard, { key: "ArrowRight" });

      expect(onMoveTable).not.toHaveBeenCalled();
    });
  });
});
