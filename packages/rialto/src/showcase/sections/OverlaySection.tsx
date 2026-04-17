import { useState } from "react";
import { Dialog } from "../../components/Dialog/Dialog";
import { Drawer } from "../../components/Drawer/Drawer";
import { Popover } from "../../components/Popover/Popover";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { HoverCard } from "../../components/HoverCard/HoverCard";
import { DropdownMenu } from "../../components/DropdownMenu/DropdownMenu";
import { ContextMenu } from "../../components/ContextMenu/ContextMenu";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Button } from "../../components/Button/Button";
import { Text } from "../../components/Text/Text";
import { Input } from "../../components/Input/Input";
import css from "../showcase.module.css";

export function OverlaySection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-xl)" }}>
      {/* Tooltips */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Tooltips
        </Text>
        <div className={css.row}>
          <Tooltip content="This is a tooltip">
            <Button variant="secondary" size="sm">Hover me</Button>
          </Tooltip>
          <Tooltip content="Another tooltip with longer text that wraps nicely">
            <Button variant="ghost" size="sm">More info</Button>
          </Tooltip>
        </div>
      </div>

      {/* Popover */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Popover
        </Text>
        <Popover
          trigger={<Button variant="secondary" size="sm">Open Popover</Button>}
        >
          <div style={{ padding: "var(--rialto-space-sm)", width: 240 }}>
            <Text variant="label" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>Settings</Text>
            <Input label="Name" placeholder="Enter name" />
          </div>
        </Popover>
      </div>

      {/* HoverCard */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Hover Card
        </Text>
        <HoverCard
          trigger={<Text variant="body" color="accent" style={{ cursor: "pointer", textDecoration: "underline" }}>Hover for details</Text>}
        >
          <div style={{ padding: "var(--rialto-space-sm)", width: 280 }}>
            <Text variant="label">Matt Butler</Text>
            <Text variant="caption" color="secondary">Full-stack engineer working on hospitality tech.</Text>
          </div>
        </HoverCard>
      </div>

      {/* Dropdown Menu */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Dropdown Menu
        </Text>
        <DropdownMenu
          trigger={<Button variant="secondary" size="sm">Actions</Button>}
          items={[
            { label: "Edit", onClick: () => {} },
            { label: "Duplicate", onClick: () => {} },
            { label: "Archive", onClick: () => {} },
            { type: "separator" },
            { label: "Delete", onClick: () => {}, destructive: true },
          ]}
        />
      </div>

      {/* Context Menu */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Context Menu (right-click the box)
        </Text>
        <ContextMenu
          items={[
            { label: "Copy", onClick: () => {} },
            { label: "Paste", onClick: () => {} },
            { type: "separator" },
            { label: "Select all", onClick: () => {} },
          ]}
        >
          <div
            style={{
              width: 200,
              height: 100,
              background: "var(--rialto-surface-recessed)",
              borderRadius: "var(--rialto-radius-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px dashed var(--rialto-border)",
            }}
          >
            <Text variant="caption" color="tertiary">Right-click here</Text>
          </div>
        </ContextMenu>
      </div>

      {/* Dialog & Drawer triggers */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Dialog, Drawer & Confirm
        </Text>
        <div className={css.row}>
          <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>Open Dialog</Button>
          <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>Open Drawer</Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>Open Confirm</Button>
        </div>

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Example Dialog">
          <div style={{ padding: "var(--rialto-space-md)" }}>
            <Text variant="body">This is a dialog with a title, content area, and close behavior.</Text>
            <div style={{ marginBlockStart: "var(--rialto-space-md)", display: "flex", justifyContent: "flex-end", gap: "var(--rialto-space-sm)" }}>
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => setDialogOpen(false)}>Confirm</Button>
            </div>
          </div>
        </Dialog>

        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Example Drawer">
          <div style={{ padding: "var(--rialto-space-md)" }}>
            <Text variant="body">This is a slide-out drawer panel.</Text>
            <Input label="Name" placeholder="Enter name" style={{ marginBlockStart: "var(--rialto-space-md)" }} />
          </div>
        </Drawer>

        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          title="Delete item?"
          description="This action cannot be undone. The item will be permanently removed."
          confirmLabel="Delete"
          variant="destructive"
        />
      </div>
    </div>
  );
}
