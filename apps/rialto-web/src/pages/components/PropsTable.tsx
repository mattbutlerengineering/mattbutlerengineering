import { Table } from "@mattbutlerengineering/rialto";
import { usePropsFromManifest } from "../../hooks/use-props-from-manifest.js";

export interface PropDef {
  name: string;
  type: string;
  default?: string;
  description: string;
  [key: string]: unknown;
}

type PropsTableProps =
  | { component: string; props?: never }
  | { props: PropDef[]; component?: never };

/**
 * Renders a typed props/API documentation table using the Rialto Table component.
 *
 * Accepts either:
 * - `component="Button"` — reads props from the compiled rialto manifest
 * - `props={[...]}` — explicit prop definitions (legacy; prefer component=)
 *
 * Columns: Prop, Type, Default, Description
 */
export function PropsTable({ props, component }: PropsTableProps) {
  const manifestProps = usePropsFromManifest(component ?? "");
  const propDefs = component ? manifestProps : (props ?? []);
  return (
    <Table<PropDef>
      columns={[
        {
          key: "name",
          header: "Prop",
          width: "140px",
          render: (row) => (
            <code
              style={{
                fontFamily: "var(--rialto-font-mono)",
                fontSize: "var(--rialto-text-sm)",
                color: "var(--rialto-accent)",
                background: "var(--rialto-accent-muted)",
                padding: "1px 4px",
                borderRadius: "var(--rialto-radius-sharp)",
              }}
            >
              {row.name as string}
            </code>
          ),
        },
        {
          key: "type",
          header: "Type",
          width: "180px",
          render: (row) => (
            <code
              style={{
                fontFamily: "var(--rialto-font-mono)",
                fontSize: "var(--rialto-text-xs)",
                color: "var(--rialto-text-secondary)",
              }}
            >
              {row.type as string}
            </code>
          ),
        },
        {
          key: "default",
          header: "Default",
          width: "100px",
          render: (row) =>
            row.default ? (
              <code
                style={{
                  fontFamily: "var(--rialto-font-mono)",
                  fontSize: "var(--rialto-text-xs)",
                  color: "var(--rialto-text-tertiary)",
                }}
              >
                {row.default as string}
              </code>
            ) : (
              <Text
                style={{
                  fontSize: "var(--rialto-text-xs)",
                  color: "var(--rialto-text-tertiary)",
                }}
              >
                —
              </Text>
            ),
        },
        {
          key: "description",
          header: "Description",
        },
      ]}
      data={propDefs}
      rowKey={(row) => row.name}
    />
  );
}

PropsTable.displayName = "PropsTable";
