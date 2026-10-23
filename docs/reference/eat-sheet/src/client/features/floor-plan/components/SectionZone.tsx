import { useCallback, useRef } from "react";
import { Group, Rect, Text, Line } from "react-konva";
import type Konva from "konva";
import type { EditorSection } from "../types";
import type { TextureMap } from "../hooks/useTextures";

interface SectionZoneProps {
  readonly section: EditorSection;
  readonly isSelected: boolean;
  readonly textures: TextureMap;
  readonly onSelect: (id: string) => void;
  readonly onDragEnd: (id: string, x: number, y: number) => void;
  readonly onTransformEnd: (id: string, width: number, height: number, x: number, y: number) => void;
}

export function SectionZone({
  section,
  isSelected,
  textures,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: SectionZoneProps) {
  const groupRef = useRef<Konva.Group>(null);

  const handleClick = useCallback(() => {
    onSelect(section.id);
  }, [onSelect, section.id]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd(section.id, e.target.x(), e.target.y());
    },
    [onDragEnd, section.id],
  );

  const handleTransformEnd = useCallback(() => {
    const node = groupRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    node.scaleX(1);
    node.scaleY(1);

    onTransformEnd(
      section.id,
      Math.max(40, section.width * scaleX),
      Math.max(40, section.height * scaleY),
      node.x(),
      node.y(),
    );
  }, [onTransformEnd, section.id, section.width, section.height]);

  const floorTexture = section.floorMaterial ? textures[section.floorMaterial] : undefined;
  const pillWidth = section.name.length * 7.5 + 16;

  return (
    <Group
      ref={groupRef}
      id={section.id}
      x={section.x}
      y={section.y}
      width={section.width}
      height={section.height}
      draggable
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
    >
      {/* Section area fill */}
      {floorTexture ? (
        <>
          <Rect
            width={section.width}
            height={section.height}
            fillPatternImage={floorTexture}
            fillPatternRepeat="repeat"
            opacity={0.2}
            stroke={isSelected ? section.color : `${section.color}88`}
            strokeWidth={isSelected ? 2 : 1.5}
            cornerRadius={4}
          />
          <Rect
            width={section.width}
            height={section.height}
            fill={`${section.color}15`}
            stroke={isSelected ? section.color : `${section.color}88`}
            strokeWidth={isSelected ? 2 : 1.5}
            cornerRadius={4}
          />
        </>
      ) : (
        <Rect
          width={section.width}
          height={section.height}
          fill={`${section.color}15`}
          stroke={isSelected ? section.color : `${section.color}88`}
          strokeWidth={isSelected ? 2 : 1.5}
          cornerRadius={4}
        />
      )}
      {/* Inner shadow Lines */}
      <Line
        points={[4, 2, section.width - 4, 2]}
        stroke="rgba(0,0,0,0.06)"
        strokeWidth={1}
        listening={false}
      />
      <Line
        points={[2, 4, 2, section.height - 4]}
        stroke="rgba(0,0,0,0.06)"
        strokeWidth={1}
        listening={false}
      />
      {/* Label with background pill */}
      <Rect
        x={8}
        y={6}
        width={pillWidth}
        height={20}
        fill={`${section.color}25`}
        cornerRadius={3}
        shadowColor="#000000"
        shadowBlur={4}
        shadowOffsetY={1}
        shadowOpacity={0.15}
        listening={false}
      />
      <Text
        text={section.name.toUpperCase()}
        x={16}
        y={9}
        fontSize={11}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontStyle="600"
        fill={isSelected ? section.color : `${section.color}cc`}
        letterSpacing={1.2}
        listening={false}
      />
    </Group>
  );
}
