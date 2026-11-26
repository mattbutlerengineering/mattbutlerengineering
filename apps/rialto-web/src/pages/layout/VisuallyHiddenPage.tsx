import { DataList, VisuallyHidden } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

export function VisuallyHiddenPage() {
  return (
    <ComponentPageLayout
      name="Visually Hidden"
      description="Removes content visually while keeping it in the accessibility tree, so screen readers still announce it."
    >
      <Section title="Icon-only button">
        <button type="button">
          <span aria-hidden="true">✕</span>
          <VisuallyHidden>Close</VisuallyHidden>
        </button>
      </Section>

      <Section title="Props">
        <PropsTable component="VisuallyHidden" />
      </Section>

      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<span>" },
            { label: "Focusable", value: "Becomes visible while it or a descendant has focus" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}
