import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TABLE_VALID_TRANSITIONS, type TableStatus } from "@mbe/types";
import { TableStatusMenu, type TableStatusMenuProps } from "./TableStatusMenu.js";
import { tableStatusMenuItems } from "./table-status-menu.js";

const STATUSES: TableStatus[] = ["AVAILABLE", "OCCUPIED", "DIRTY", "READY"];
const TRIGGER_NAME = "Table 3: Occupied. Change status";

function readCss(): string {
  return readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "TableStatusMenu.module.css"),
    "utf-8"
  );
}

/* ── The pure projection ─────────────────────────────── */

describe("tableStatusMenuItems (A8.2 — a projection of the API's own state machine)", () => {
  it.each(STATUSES)("%s offers one 'Mark <state>' item per valid transition", (status) => {
    expect(tableStatusMenuItems(status)).toEqual(
      TABLE_VALID_TRANSITIONS[status].map((next) => ({
        id: next,
        label: `Mark ${next.toLowerCase()}`,
      }))
    );
  });

  it("AVAILABLE offers exactly 'Mark occupied'", () => {
    expect(tableStatusMenuItems("AVAILABLE")).toEqual([{ id: "OCCUPIED", label: "Mark occupied" }]);
  });

  it("an unknown status offers nothing", () => {
    expect(tableStatusMenuItems("BOGUS" as TableStatus)).toEqual([]);
  });
});

/* ── The control ─────────────────────────────────────── */

function renderMenu(overrides: Partial<TableStatusMenuProps> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <TableStatusMenu
      tableId="t3"
      tableName="Table 3"
      status="OCCUPIED"
      onChange={onChange}
      {...overrides}
    />
  );
  return { ...utils, onChange };
}

describe("TableStatusMenu", () => {
  describe("names the current state and the action (A8.1)", () => {
    it("exposes 'Table 3: Occupied. Change status' on a real, closed menu button", () => {
      const { onChange } = renderMenu();
      const trigger = screen.getByRole("button", { name: TRIGGER_NAME });
      expect(trigger.tagName).toBe("BUTTON");
      expect(trigger).toHaveAttribute("data-testid", "table-status-t3");
      expect(trigger).toHaveAttribute("aria-haspopup", "menu");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toBeEnabled();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it.each([
      ["AVAILABLE", "Table 3: Available. Change status"],
      ["DIRTY", "Table 3: Dirty. Change status"],
      ["READY", "Table 3: Ready. Change status"],
    ] as const)("%s reads as %s", (status, name) => {
      renderMenu({ status });
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    });

    it("keeps the LED decorative so the name is spoken once", () => {
      renderMenu();
      const trigger = screen.getByRole("button", { name: TRIGGER_NAME });
      const led = trigger.querySelector('[role="presentation"]');
      expect(led).not.toBeNull();
      expect(led).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("one activation never commits (A8.2)", () => {
    it("Enter opens the menu and calls nothing", () => {
      const { onChange } = renderMenu();
      const trigger = screen.getByRole("button", { name: TRIGGER_NAME });
      act(() => trigger.focus());
      fireEvent.keyDown(trigger, { key: "Enter" });
      const menu = screen.getByRole("menu");
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent)
      ).toEqual(["Mark dirty"]);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("ArrowDown opens the menu and calls nothing", () => {
      const { onChange } = renderMenu();
      const trigger = screen.getByRole("button", { name: TRIGGER_NAME });
      act(() => trigger.focus());
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      expect(screen.getByRole("menuitem", { name: "Mark dirty" })).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("a tap opens the menu and calls nothing", async () => {
      const user = userEvent.setup();
      const { onChange } = renderMenu();
      await user.click(screen.getByRole("button", { name: TRIGGER_NAME }));
      expect(screen.getByRole("menuitem", { name: "Mark dirty" })).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("choosing an item calls onChange exactly once with that state and closes", async () => {
      const user = userEvent.setup();
      const { onChange } = renderMenu({ status: "AVAILABLE" });
      await user.click(screen.getByRole("button", { name: "Table 3: Available. Change status" }));
      await user.click(screen.getByRole("menuitem", { name: "Mark occupied" }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("OCCUPIED");
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    });

    it("Escape closes with no callback", async () => {
      const user = userEvent.setup();
      const { onChange } = renderMenu();
      await user.click(screen.getByRole("button", { name: TRIGGER_NAME }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("pending — the gold in-flight treatment", () => {
    it("disables the trigger, keeps its name, marks it in flight, and the menu stays shut", async () => {
      const user = userEvent.setup();
      const { onChange } = renderMenu({ pending: true });
      const trigger = screen.getByRole("button", { name: TRIGGER_NAME });
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveClass("pending");
      await user.click(trigger);
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("paints the in-flight trigger with the accent token and nothing else gold", () => {
      const css = readCss();
      const pendingRule = css.match(/\.pending\s*\{([^}]*)\}/)?.[1] ?? "";
      expect(pendingRule).toMatch(/var\(--rialto-accent\)/);
      const otherRules = css.replace(/\.pending\s*\{[^}]*\}/, "");
      expect(otherRules).not.toMatch(/--rialto-accent\b/);
    });

    it("an unknown status renders the trigger disabled with its name", () => {
      renderMenu({ status: "BOGUS" as TableStatus });
      expect(screen.getByRole("button", { name: "Table 3: Bogus. Change status" })).toBeDisabled();
    });
  });

  describe("44 px inside the 60 px row (A8.3)", () => {
    it("gives the trigger a 44 × 44 minimum under the coarse-pointer / tablet query", () => {
      const css = readCss();
      const coarseBlock = css.match(
        /@media \(pointer: coarse\), \(max-width: 1024px\) \{([\s\S]*?)\n\}/
      );
      expect(coarseBlock).not.toBeNull();
      const triggerRule = coarseBlock?.[1].match(/\.trigger\s*\{([^}]*)\}/)?.[1] ?? "";
      expect(triggerRule).toMatch(/min-block-size:\s*44px/);
      expect(triggerRule).toMatch(/min-inline-size:\s*44px/);
    });
  });
});
