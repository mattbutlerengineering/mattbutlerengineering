import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toolbar, ToolbarSeparator } from "./Toolbar";

function renderThree(props: Partial<React.ComponentProps<typeof Toolbar>> = {}) {
  return render(
    <Toolbar aria-label="Formatting" {...props}>
      <button type="button">Bold</button>
      <button type="button">Italic</button>
      <button type="button">Underline</button>
    </Toolbar>
  );
}

describe("Toolbar", () => {
  it("makes only the first control a tab stop and ArrowRight moves roving focus", async () => {
    const user = userEvent.setup();
    renderThree();
    const [bold, italic, underline] = screen.getAllByRole("button");
    expect(bold).toHaveAttribute("tabindex", "0");
    expect(italic).toHaveAttribute("tabindex", "-1");
    expect(underline).toHaveAttribute("tabindex", "-1");

    await user.tab();
    expect(bold).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(italic).toHaveFocus();
    expect(italic).toHaveAttribute("tabindex", "0");
    expect(bold).toHaveAttribute("tabindex", "-1");
  });

  it("renders role=toolbar with orientation and passes the accessible name", () => {
    renderThree();
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    expect(toolbar).toHaveAttribute("aria-orientation", "horizontal");
  });

  it("wraps with ArrowLeft/ArrowRight and supports Home/End", async () => {
    const user = userEvent.setup();
    renderThree();
    const [bold, , underline] = screen.getAllByRole("button");
    await user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(underline).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(bold).toHaveFocus();
    await user.keyboard("{End}");
    expect(underline).toHaveFocus();
    await user.keyboard("{Home}");
    expect(bold).toHaveFocus();
  });

  it("uses ArrowDown/ArrowUp when vertical and ignores horizontal arrows", async () => {
    const user = userEvent.setup();
    renderThree({ orientation: "vertical" });
    const [bold, italic] = screen.getAllByRole("button");
    expect(screen.getByRole("toolbar")).toHaveAttribute("aria-orientation", "vertical");
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(bold).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(italic).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(bold).toHaveFocus();
  });

  it("skips disabled and aria-disabled controls", async () => {
    const user = userEvent.setup();
    render(
      <Toolbar aria-label="Skips">
        <button type="button">One</button>
        <button type="button" disabled>
          Two
        </button>
        <button type="button" aria-disabled="true">
          Three
        </button>
        <button type="button">Four</button>
      </Toolbar>
    );
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Four" })).toHaveFocus();
  });

  it("re-enters on the last focused control", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Toolbar aria-label="Reenter">
          <button type="button">A</button>
          <button type="button">B</button>
        </Toolbar>
        <button type="button">After</button>
      </>
    );
    await user.tab();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "B" })).toHaveFocus();
  });

  it("swaps ArrowLeft/ArrowRight in RTL", async () => {
    const user = userEvent.setup();
    render(
      <div dir="rtl" style={{ direction: "rtl" }}>
        <Toolbar aria-label="Rtl">
          <button type="button">A</button>
          <button type="button">B</button>
        </Toolbar>
      </div>
    );
    await user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "B" })).toHaveFocus();
  });

  it("renders ToolbarSeparator perpendicular to the toolbar", () => {
    render(
      <Toolbar aria-label="Sep">
        <button type="button">A</button>
        <ToolbarSeparator />
        <button type="button">B</button>
      </Toolbar>
    );
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  });
});
