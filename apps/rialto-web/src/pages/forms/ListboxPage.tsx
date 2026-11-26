import { useState } from "react";
import { DataList, Listbox } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

const SECTIONS = [
  { value: "bar", label: "Bar" },
  { value: "patio", label: "Patio" },
  { value: "private", label: "Private dining", disabled: true },
  { value: "terrace", label: "Terrace" },
];

export function ListboxPage() {
  const [section, setSection] = useState<string | string[]>("bar");
  const [shifts, setShifts] = useState<string | string[]>(["lunch"]);

  return (
    <ComponentPageLayout
      name="Listbox"
      description="An always-visible list of options with one Tab stop. Arrow keys move through it, so staff can pick a section or shift without opening a menu."
    >
      <Section title="Single select">
        <Listbox
          aria-label="Seating section"
          options={SECTIONS}
          value={section}
          onValueChange={setSection}
        />
        <p>Selected: {String(section)}</p>
      </Section>

      <Section title="Multiple select">
        <Listbox
          aria-label="Shifts"
          multiple
          options={[
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
            { value: "late", label: "Late night" },
          ]}
          value={shifts}
          onValueChange={setShifts}
        />
        <p>Selected: {Array.isArray(shifts) ? shifts.join(", ") : shifts}</p>
      </Section>

      <Section title="Props">
        <PropsTable component="Listbox" />
      </Section>

      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=listbox with role=option children" },
            {
              label: "Focus",
              value: "One Tab stop; aria-activedescendant tracks the active option",
            },
            {
              label: "Keyboard",
              value: "Arrows, Home/End, type-ahead; multiple adds Space, Shift+Arrow, Ctrl+A",
            },
            { label: "Disabled", value: "aria-disabled options are skipped and ignore clicks" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ListboxPage.displayName = "ListboxPage";
