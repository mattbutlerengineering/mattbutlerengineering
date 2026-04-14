import { DataList, Tree } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TreePage() {
  return (
    <ComponentPageLayout
      name="Tree"
      description="Hierarchical data display with expand/collapse. Best for file systems, org charts, nested categories. Single-selection with gold accent. Arrow key navigation supported."
    >
      {/* ── File System ───────────────────────────────────────────── */}
      <Section title="File System">
        <Tree
          data={[
            {
              id: "src",
              label: "src",
              children: [
                {
                  id: "components",
                  label: "components",
                  children: [
                    { id: "button", label: "Button.tsx" },
                    { id: "input", label: "Input.tsx" },
                    { id: "select", label: "Select.tsx" },
                  ],
                },
                {
                  id: "utils",
                  label: "utils",
                  children: [
                    { id: "helpers", label: "helpers.ts" },
                    { id: "format", label: "format.ts" },
                  ],
                },
                { id: "app", label: "App.tsx" },
                { id: "main", label: "main.tsx" },
              ],
            },
            {
              id: "public",
              label: "public",
              children: [
                { id: "index", label: "index.html" },
                { id: "favicon", label: "favicon.ico" },
              ],
            },
            { id: "package", label: "package.json" },
            { id: "tsconfig", label: "tsconfig.json" },
          ]}
          defaultExpanded={["src"]}
        />
      </Section>

      {/* ── Category Hierarchy ────────────────────────────────────── */}
      <Section title="Category Hierarchy">
        <Tree
          data={[
            {
              id: "engineering",
              label: "Engineering",
              children: [
                {
                  id: "frontend",
                  label: "Frontend",
                  children: [
                    { id: "react", label: "React" },
                    { id: "typescript", label: "TypeScript" },
                    { id: "css", label: "CSS" },
                  ],
                },
                {
                  id: "backend",
                  label: "Backend",
                  children: [
                    { id: "node", label: "Node.js" },
                    { id: "postgres", label: "PostgreSQL" },
                  ],
                },
              ],
            },
            {
              id: "design",
              label: "Design",
              children: [
                { id: "rialto", label: "Rialto System" },
                { id: "figma", label: "Figma" },
              ],
            },
          ]}
          defaultExpanded={["engineering", "frontend"]}
        />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "data",
              type: "TreeNode[]",
              description: "Recursive tree data structure.",
            },
            {
              name: "defaultExpanded",
              type: "string[]",
              description: "Node IDs that are expanded on first render.",
            },
            {
              name: "selectedId",
              type: "string",
              description: "Currently selected node ID.",
            },
            {
              name: "onSelect",
              type: "(id: string) => void",
              description: "Called when a node is selected.",
            },
          ]}
        />
      </Section>

      {/* ── TreeNode Shape ────────────────────────────────────────── */}
      <Section title="TreeNode Shape">
        <PropsTable
          props={[
            {
              name: "id",
              type: "string",
              description: "Unique identifier for the node.",
            },
            {
              name: "label",
              type: "string",
              description: "Display text for the node.",
            },
            {
              name: "children",
              type: "TreeNode[]",
              description: "Optional child nodes (makes this node a branch).",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=tree with role=treeitem for each node" },
            { label: "State", value: "aria-expanded on branch nodes, aria-selected on selection" },
            { label: "Keyboard", value: "Arrow Up/Down to navigate, Right to expand, Left to collapse" },
            { label: "Keyboard", value: "Home/End jump to first/last visible node" },
            { label: "Focus", value: "Gold glow ring on focused node" },
            {
              label: "Screen reader",
              value:
                "Items announced with level, position in set, and expanded/collapsed state; arrow keys navigate tree structure; Enter toggles expansion",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TreePage.displayName = "TreePage";
