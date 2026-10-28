import { Group, Label, Path, Tag, Text } from "react-konva";
import type { TableShapeName } from "./floor-plan-geometry.js";
import type { SectionLabelTheme } from "./section-label-theme.js";
import {
  GLYPH_STROKE_WIDTH,
  GLYPH_VIEWBOX,
  STATUS_GLYPHS,
  type StatusGlyphKey,
} from "./table-status-glyph.js";
import {
  LABEL_LINE_HEIGHT,
  LABEL_PADDING,
  counterRotation,
  tableLabelLayout,
} from "./table-label-layout.js";

const TABLE_LABEL_GROUP_NAME = "table-label-group";
const STATUS_GLYPH_NAME = "status-glyph";

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
  /** The status glyph drawn at the plate's leading edge; null = none (no statuses supplied). */
  glyph: StatusGlyphKey | null;
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
  glyph,
}: TableLabelProps) {
  const layout = tableLabelLayout({
    glyph: glyph !== null,
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
        {/* The text is centred in the plate's width; shifting it right by half the
            glyph slot centres it in the space the glyph leaves. */}
        <Text
          text={layout.text}
          fontSize={layout.fontSize}
          fontStyle="bold"
          lineHeight={LABEL_LINE_HEIGHT}
          padding={LABEL_PADDING}
          width={layout.width}
          offsetX={-layout.glyphSlot / 2}
          align="center"
          wrap="none"
          fill={theme.text}
        />
      </Label>
      {glyph && (
        <Path
          name={STATUS_GLYPH_NAME}
          data={STATUS_GLYPHS[glyph].path}
          x={-layout.width / 2 + LABEL_PADDING}
          y={-layout.glyphSize / 2}
          scaleX={layout.glyphSize / GLYPH_VIEWBOX}
          scaleY={layout.glyphSize / GLYPH_VIEWBOX}
          stroke={theme.text}
          strokeWidth={GLYPH_STROKE_WIDTH}
          fill={STATUS_GLYPHS[glyph].filled ? theme.text : undefined}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )}
    </Group>
  );
}
