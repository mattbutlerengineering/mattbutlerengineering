import { Group, Label, Tag, Text } from "react-konva";
import type { TableShapeName } from "./floor-plan-geometry.js";
import type { SectionLabelTheme } from "./section-label-theme.js";
import {
  LABEL_LINE_HEIGHT,
  LABEL_PADDING,
  counterRotation,
  tableLabelLayout,
} from "./table-label-layout.js";

const TABLE_LABEL_GROUP_NAME = "table-label-group";

export interface TableLabelProps {
  number: string;
  covers: string;
  shape: TableShapeName;
  capacity: number;
  /** The table footprint, in canvas units. */
  tableWidth: number;
  tableHeight: number;
  /** The rotation of the table group this label is drawn inside. */
  tableRotation: number;
  stageScale: number;
  /** Plate and ink colours, resolved from `--rialto-surface` / `--rialto-text-primary`. */
  theme: SectionLabelTheme;
}

/**
 * The table's number and cover range on an opaque plate. The plate carries its
 * own contrast (two rialto tokens) instead of depending on the status fill
 * beneath it, and is counter-rotated so it reads upright at any table rotation.
 */
export function TableLabel({
  number,
  covers,
  shape,
  capacity,
  tableWidth,
  tableHeight,
  tableRotation,
  stageScale,
  theme,
}: TableLabelProps) {
  const layout = tableLabelLayout({
    number,
    covers,
    shape,
    capacity,
    width: tableWidth,
    height: tableHeight,
    rotation: tableRotation,
    stageScale,
  });
  return (
    <Group
      name={TABLE_LABEL_GROUP_NAME}
      rotation={counterRotation(tableRotation)}
      listening={false}
    >
      <Label offsetX={layout.width / 2} offsetY={layout.height / 2}>
        <Tag fill={theme.plate} cornerRadius={3} />
        <Text
          text={layout.text}
          fontSize={layout.fontSize}
          fontStyle="bold"
          lineHeight={LABEL_LINE_HEIGHT}
          padding={LABEL_PADDING}
          width={layout.width}
          align="center"
          wrap="none"
          fill={theme.text}
        />
      </Label>
    </Group>
  );
}
