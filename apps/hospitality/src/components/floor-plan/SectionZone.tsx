import { Group, Rect, Text } from "react-konva";

/** One section's zone on the canvas: its row's name/colour plus the layout rectangle. */
export interface SectionZoneData {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SectionZoneProps {
  zone: SectionZoneData;
}

/**
 * A translucent coloured area drawn beneath the tables. It never listens for
 * pointer events (the stage and the tables above it keep their interactions),
 * and the name is drawn on the zone so colour is never the only cue.
 */
export function SectionZone({ zone }: SectionZoneProps) {
  return (
    <Group name={zone.name}>
      <Rect
        x={zone.x}
        y={zone.y}
        width={zone.width}
        height={zone.height}
        fill={zone.color}
        opacity={0.18}
        stroke={zone.color}
        strokeWidth={1}
        dash={[6, 4]}
        cornerRadius={6}
        listening={false}
      />
      <Text
        x={zone.x + 8}
        y={zone.y + 6}
        text={zone.name}
        fontSize={14}
        fill={zone.color}
        listening={false}
      />
    </Group>
  );
}
