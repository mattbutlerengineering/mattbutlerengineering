/**
 * Interaction tests for stateful Rialto components.
 * Verifies user interactions work correctly (click, type, keyboard).
 */
import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "./Button/Button";
import { Card } from "./Card/Card";
import { Checkbox } from "./Checkbox/Checkbox";
import { Toggle } from "./Toggle/Toggle";
import { Input } from "./Input/Input";
import { TextArea } from "./TextArea/TextArea";
import { Tabs } from "./Tabs/Tabs";
import { Accordion } from "./Accordion/Accordion";
import { Collapsible } from "./Collapsible/Collapsible";
import { Dialog } from "./Dialog/Dialog";
import { ConfirmDialog } from "./ConfirmDialog/ConfirmDialog";
import { Pagination } from "./Pagination/Pagination";
import { SegmentedControl } from "./SegmentedControl/SegmentedControl";
import { Tag } from "./Tag/Tag";
import { ToastProvider } from "./Toast/Toast";
import { useToast } from "./Toast/ToastContext";
import { Tree } from "./Tree/Tree";

const user = userEvent.setup();

describe("Interaction tests", () => {
  it("Button fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("Button does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Click
      </Button>
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("Disabled button has native disabled attribute", () => {
    render(<Button disabled>Save</Button>);
    const button = screen.getByRole("button", { name: /save/i });
    expect(button).toBeDisabled();
  });

  it("Disabled button is not keyboard-focusable", async () => {
    render(
      <>
        <Button>First</Button>
        <Button disabled>Second</Button>
        <Button>Third</Button>
      </>
    );
    await user.tab();
    expect(screen.getByRole("button", { name: /first/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /third/i })).toHaveFocus();
  });

  it("Input with disabledReason renders aria-disabled and readOnly", () => {
    render(<Input label="Email" disabled disabledReason="Account locked" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-disabled", "true");
    expect(input).toHaveAttribute("readOnly");
  });

  it("Checkbox toggles on click", async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Accept" onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("Toggle switches on click", async () => {
    const onChange = vi.fn();
    render(<Toggle label="Dark mode" onCheckedChange={onChange} />);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("Input accepts text", async () => {
    render(<Input label="Name" />);
    const input = screen.getByLabelText("Name");
    await user.type(input, "Alice");
    expect(input).toHaveValue("Alice");
  });

  it("Input shows error state", () => {
    render(<Input label="Email" error />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid");
  });

  it("TextArea accepts multi-line text", async () => {
    render(<TextArea label="Bio" />);
    const textarea = screen.getByLabelText("Bio");
    await user.type(textarea, "Line 1");
    expect(textarea).toHaveValue("Line 1");
  });

  it("Tabs switch content on click", async () => {
    render(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A", content: <p>Content A</p> },
          { id: "b", label: "Tab B", content: <p>Content B</p> },
        ]}
      />
    );
    expect(screen.getByText("Content A")).toBeInTheDocument();
    await user.click(screen.getByText("Tab B"));
    expect(screen.getByText("Content B")).toBeInTheDocument();
  });

  it("Accordion expands on click", async () => {
    render(
      <Accordion
        items={[
          { id: "1", title: "Section 1", content: "Content 1" },
          { id: "2", title: "Section 2", content: "Content 2" },
        ]}
      />
    );
    const trigger = screen.getByText("Section 1").closest("button")!;
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("Collapsible expands on click", async () => {
    render(
      <Collapsible trigger="Show more">
        <p>Hidden content</p>
      </Collapsible>
    );
    await user.click(screen.getByText("Show more"));
    expect(screen.getByText("Hidden content")).toBeInTheDocument();
  });

  it("Dialog renders content when open", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} title="Test Dialog">
        <p>Dialog body</p>
      </Dialog>
    );
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog body")).toBeInTheDocument();
  });

  it("Dialog does not render when closed", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Hidden">
        <p>Hidden body</p>
      </Dialog>
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("ConfirmDialog calls onConfirm", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        title="Delete item?"
        confirmLabel="Delete"
      />
    );
    await user.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("ConfirmDialog calls onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open={true} onConfirm={vi.fn()} onCancel={onCancel} title="Delete item?" />
    );
    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Pagination navigates pages", async () => {
    const onChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByText("3"));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("SegmentedControl switches value", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        segments={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ]}
        value="a"
        onChange={onChange}
      />
    );
    await user.click(screen.getByText("Beta"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("Tag dismissible fires onDismiss", async () => {
    const onDismiss = vi.fn();
    render(
      <Tag dismissible onDismiss={onDismiss}>
        Remove me
      </Tag>
    );
    const dismissButton = screen.getByRole("button", { name: /remove/i });
    await user.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("Toast shows notification", async () => {
    function TestToast() {
      const { toast } = useToast();
      return <button onClick={() => toast({ title: "Saved!" })}>Save</button>;
    }
    render(
      <ToastProvider>
        <TestToast />
      </ToastProvider>
    );
    await user.click(screen.getByText("Save"));
    expect(screen.getByText("Saved!")).toBeInTheDocument();
  });

  it("Tree expands node on click", async () => {
    render(
      <Tree
        data={[
          {
            id: "root",
            label: "Root",
            children: [{ id: "child", label: "Child" }],
          },
        ]}
        defaultExpanded={[]}
      />
    );
    expect(screen.getByText("Root")).toBeInTheDocument();
    const rootButton = screen.getByRole("treeitem", { name: "Root" });
    expect(rootButton).toHaveAttribute("aria-expanded", "false");
    // Click the toggle span (expand/collapse chevron) inside the treeitem
    const toggleSpan = rootButton.querySelector('[role="presentation"]')!;
    await user.click(toggleSpan);
    expect(rootButton).toHaveAttribute("aria-expanded", "true");
  });

  it("Tree keyboard: ArrowDown/ArrowUp moves focus", async () => {
    render(
      <Tree
        data={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Bravo" },
          { id: "c", label: "Charlie" },
        ]}
      />
    );
    const alpha = screen.getByRole("treeitem", { name: "Alpha" });
    act(() => alpha.focus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("treeitem", { name: "Bravo" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("treeitem", { name: "Charlie" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("treeitem", { name: "Bravo" })).toHaveFocus();
  });

  it("Tree keyboard: ArrowRight expands, ArrowLeft collapses", async () => {
    render(
      <Tree
        data={[
          {
            id: "parent",
            label: "Parent",
            children: [{ id: "child", label: "Child" }],
          },
        ]}
        defaultExpanded={[]}
      />
    );
    const parent = screen.getByRole("treeitem", { name: "Parent" });
    act(() => parent.focus());
    expect(parent).toHaveAttribute("aria-expanded", "false");
    // ArrowRight expands
    await user.keyboard("{ArrowRight}");
    expect(parent).toHaveAttribute("aria-expanded", "true");
    // ArrowRight again moves to first child
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("treeitem", { name: "Child" })).toHaveFocus();
    // ArrowLeft from child moves to parent
    await user.keyboard("{ArrowLeft}");
    expect(parent).toHaveFocus();
    // ArrowLeft on expanded parent collapses it
    await user.keyboard("{ArrowLeft}");
    expect(parent).toHaveAttribute("aria-expanded", "false");
  });

  it("Tree keyboard: Home/End jump to first/last", async () => {
    render(
      <Tree
        data={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Bravo" },
          { id: "c", label: "Charlie" },
        ]}
      />
    );
    const alpha = screen.getByRole("treeitem", { name: "Alpha" });
    act(() => alpha.focus());
    await user.keyboard("{End}");
    expect(screen.getByRole("treeitem", { name: "Charlie" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("treeitem", { name: "Alpha" })).toHaveFocus();
  });

  it("Tree keyboard: Enter selects and toggles", async () => {
    const onSelect = vi.fn();
    render(
      <Tree
        data={[
          {
            id: "parent",
            label: "Parent",
            children: [{ id: "child", label: "Child" }],
          },
        ]}
        defaultExpanded={[]}
        onSelect={onSelect}
      />
    );
    const parent = screen.getByRole("treeitem", { name: "Parent" });
    act(() => parent.focus());
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "parent" }));
    expect(parent).toHaveAttribute("aria-expanded", "true");
  });

  it("Tree keyboard: type-ahead focuses matching node", async () => {
    render(
      <Tree
        data={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Bravo" },
          { id: "c", label: "Charlie" },
        ]}
      />
    );
    const alpha = screen.getByRole("treeitem", { name: "Alpha" });
    act(() => alpha.focus());
    await user.keyboard("c");
    expect(screen.getByRole("treeitem", { name: "Charlie" })).toHaveFocus();
  });

  it("Card with tilt applies data-tilt attribute", () => {
    render(
      <Card tilt title="Tilt">
        Content
      </Card>
    );
    const card = screen.getByText("Content").closest("[data-tilt]");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("data-tilt");
  });

  it("Card with tilt on glass variant does not apply data-tilt", () => {
    render(
      <Card tilt variant="glass" title="Glass">
        Content
      </Card>
    );
    const card = screen.getByText("Content").parentElement;
    expect(card).not.toHaveAttribute("data-tilt");
  });
});
