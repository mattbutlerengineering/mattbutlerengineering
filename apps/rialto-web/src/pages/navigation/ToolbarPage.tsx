import { useState } from "react";
import { Button, DataList, Toolbar, ToolbarSeparator } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

export function ToolbarPage() {
  const [last, setLast] = useState("none");

  return (
    <ComponentPageLayout
      name="Toolbar"
      description="A group of related controls that is one Tab stop. Arrow keys move between controls, so a long row of actions never traps keyboard users."
    >
      <Section title="Horizontal">
        <Toolbar aria-label="Booking actions">
          <Button variant="ghost" onClick={() => setLast("Seat")}>
            Seat
          </Button>
          <Button variant="ghost" onClick={() => setLast("Move")}>
            Move
          </Button>
          <ToolbarSeparator />
          <Button variant="ghost" disabled>
            Refund
          </Button>
          <Button variant="ghost" onClick={() => setLast("Cancel")}>
            Cancel
          </Button>
        </Toolbar>
        <p>Last action: {last}</p>
      </Section>

      <Section title="Vertical">
        <Toolbar aria-label="Table actions" orientation="vertical">
          <Button variant="ghost">Seat</Button>
          <Button variant="ghost">Clear</Button>
          <ToolbarSeparator toolbarOrientation="vertical" />
          <Button variant="ghost">Block</Button>
        </Toolbar>
      </Section>

      <Section title="Props">
        <PropsTable component="Toolbar" />
      </Section>

      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=toolbar with aria-orientation" },
            { label: "Tab", value: "One Tab stop; re-enters on the last focused control" },
            {
              label: "Keyboard",
              value: "Arrow keys move (mirrored in RTL), Home/End jump to the ends",
            },
            { label: "Disabled", value: "disabled and aria-disabled controls are skipped" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ToolbarPage.displayName = "ToolbarPage";
