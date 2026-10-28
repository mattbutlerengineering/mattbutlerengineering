import { Group, Label, Rect, Tag, Text } from "react-konva";
import type { FloorMaterial } from "@mbe/types";
import { TEXTURE_PATTERN_SCALE } from "./floor-textures.js";
import { SECTION_LABEL_FALLBACKS, type SectionLabelTheme } from "./section-label-theme.js";

/** Konva node names, so tests and the stage can address each layer of the zone. */
export const SECTION_TEXTURE_NAME = "section-texture";
export const SECTION_TINT_NAME = "section-tint";
export const SECTION_LABEL_NAME = "section-label";
export const SECTION_BORDER_NAME = "section-border";

const BORDER_OPACITY = 0.7;

const CORNER_RADIUS = 6;
const LABEL_PADDING = 4;
const LABEL_FONT_SIZE = 13;

/** One section's zone on the canvas: its row's name/colour plus the layout rectangle. */
export interface SectionZoneData {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The section's floor finish; `null`/absent means no texture is drawn. */
  floorMaterial?: FloorMaterial | null;
}

export interface SectionZoneProps {
  zone: SectionZoneData;
  /**
   * The loaded texture for this section's floor material. Omitted when the
   * section has no material, or when its PNG failed to load — both cases render
   * the flat colour alone, exactly as the zone did before materials existed.
   */
  texture?: HTMLImageElement;
  /** Plate and text colours for the name; defaults to the light-theme tokens. */
  labelTheme?: SectionLabelTheme;
}

/**
 * A section's area on the canvas, drawn beneath the walls and tables. It never
 * listens for pointer events (the stage and the tables above it keep their
 * interactions), and the name is drawn on the zone so colour is never the only
 * cue.
 *
 * Three layers, bottom to top: the floor texture (when there is one), the
 * section's colour as a translucent tint — so a textured section is still
 * identifiable by colour — and the name on an opaque plate.
 */
export function SectionZone({
  zone,
  texture,
  labelTheme = SECTION_LABEL_FALLBACKS.light,
}: SectionZoneProps) {
  return (
    <Group name={zone.name}>
      {texture && (
        // No `fill` here on purpose: Konva only falls through to the pattern
        // when no solid colour is set. The pattern scale is a constant in canvas
        // units, so the stage's pan/zoom transform moves pattern and geometry
        // together instead of sliding one across the other.
        <Rect
          name={SECTION_TEXTURE_NAME}
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          fillPatternImage={texture}
          fillPatternRepeat="repeat"
          fillPatternScale={TEXTURE_PATTERN_SCALE}
          cornerRadius={CORNER_RADIUS}
          listening={false}
        />
      )}
      <Rect
        name={SECTION_TINT_NAME}
        x={zone.x}
        y={zone.y}
        width={zone.width}
        height={zone.height}
        fill={zone.color}
        opacity={0.18}
        cornerRadius={CORNER_RADIUS}
        listening={false}
      />
      {/* A solid hairline in the section colour. Its own node so the tint's low
          opacity doesn't wash the edge out. */}
      <Rect
        name={SECTION_BORDER_NAME}
        x={zone.x}
        y={zone.y}
        width={zone.width}
        height={zone.height}
        stroke={zone.color}
        strokeWidth={1}
        opacity={BORDER_OPACITY}
        cornerRadius={CORNER_RADIUS}
        listening={false}
      />
      {/* Label sizes its Tag to the Text, so the plate always covers the name
          exactly — no width guess that a long section name could overflow. */}
      <Label name={SECTION_LABEL_NAME} x={zone.x + 8} y={zone.y + 6} listening={false}>
        <Tag fill={labelTheme.plate} cornerRadius={3} />
        <Text
          text={zone.name}
          fontSize={LABEL_FONT_SIZE}
          padding={LABEL_PADDING}
          fill={labelTheme.text}
        />
      </Label>
    </Group>
  );
}
