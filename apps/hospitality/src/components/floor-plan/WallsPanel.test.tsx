import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { WallLayout } from "@mbe/types";
import { WallsPanel } from "./WallsPanel.js";

const AXE = { rules: { "color-contrast": { enabled: false } } };
const walls: WallLayout[] = [
  { id: "wall-1", x1: 100, y1: 100, x2: 300, y2: 100, thickness: 8 },
  { id: "window-2", x1: 100, y1: 200, x2: 200, y2: 200, thickness: 6, wallType: "window" },
];

function setup(selectedId: string | null = null) {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <main>
      <WallsPanel walls={walls} selectedId={selectedId} onChange={onChange} onSelect={onSelect} />
    </main>
  );
  return { onChange, onSelect, ...view };
}

describe("WallsPanel", () => {
  it("has no axe violations, with and without a selection", async () => {
    const a = setup();
    expect((await axe(a.container, AXE)).violations).toEqual([]);
    a.unmount();
    const b = setup("wall-1");
    expect((await axe(b.container, AXE)).violations).toEqual([]);
  });

  it("adds a wall and a window and selects the new one", () => {
    const { onChange, onSelect } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add wall" }));
    expect(onChange.mock.calls[0]![0]).toHaveLength(3);
    expect(onChange.mock.calls[0]![0][2].wallType).toBe("wall");
    expect(onSelect).toHaveBeenCalledWith(onChange.mock.calls[0]![0][2].id);
    fireEvent.click(screen.getByRole("button", { name: "Add window" }));
    expect(onChange.mock.calls[1]![0][2].wallType).toBe("window");
  });

  it("selects a wall from the list by keyboard-reachable buttons", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Window 2/ }));
    expect(onSelect).toHaveBeenCalledWith("window-2");
  });

  it("edits endpoints and thickness of the selected wall with number fields", () => {
    const { onChange } = setup("wall-1");
    fireEvent.change(screen.getByLabelText("End X"), { target: { value: "345" } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...walls[0], x2: 340 }, walls[1]]);
    fireEvent.change(screen.getByLabelText("Thickness"), { target: { value: "500" } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...walls[0], thickness: 40 }, walls[1]]);
  });

  it("deletes the selected wall and clears the selection", () => {
    const { onChange, onSelect } = setup("wall-1");
    fireEvent.click(screen.getByRole("button", { name: "Delete wall" }));
    expect(onChange).toHaveBeenCalledWith([walls[1]]);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
