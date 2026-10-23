import type { SaveFloorPlanPayload, SaveWallPayload } from "@shared/types/floor-plan";

interface TemplateMiniPreviewProps {
  readonly payload: SaveFloorPlanPayload;
  readonly height?: number | undefined;
  readonly ariaLabel?: string | undefined;
}

function wallStyle(
  wall: SaveWallPayload,
  scaleX: number,
  scaleY: number,
): React.CSSProperties {
  const dx = Math.abs(wall.x2 - wall.x1);
  const dy = Math.abs(wall.y2 - wall.y1);
  const isHorizontal = dx >= dy;
  const isWindow = wall.wallType === "window";

  const left = Math.min(wall.x1, wall.x2) * scaleX;
  const top = Math.min(wall.y1, wall.y2) * scaleY;
  const width = isHorizontal ? dx * scaleX : wall.thickness * scaleX;
  const height = isHorizontal ? wall.thickness * scaleY : dy * scaleY;

  return {
    position: "absolute",
    left: `${left}%`,
    top: `${top}%`,
    width: `${Math.max(width, isHorizontal ? 1 : wall.thickness * scaleX)}%`,
    height: `${Math.max(height, isHorizontal ? wall.thickness * scaleY : 1)}%`,
    background: isWindow ? "rgba(135,206,235,0.4)" : "#5a4a3a",
  };
}

export function TemplateMiniPreview({
  payload,
  height = 300,
  ariaLabel,
}: TemplateMiniPreviewProps) {
  const { canvasWidth, canvasHeight, tables, sections, walls } = payload;

  const scaleX = 100 / canvasWidth;
  const scaleY = 100 / canvasHeight;

  const label =
    ariaLabel ??
    `Floor plan preview with ${tables.length} table${tables.length === 1 ? "" : "s"}` +
      (sections.length > 0
        ? ` and ${sections.length} section${sections.length === 1 ? "" : "s"}`
        : "");

  return (
    <div
      role="img"
      aria-label={label}
      style={{
        background: "#d4cfc8",
        borderRadius: "var(--rialto-radius-default, 8px)",
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: `${height}px`,
      }}
    >
      {/* Walls */}
      {walls.map((wall) => (
        <div key={wall.id} style={wallStyle(wall, scaleX, scaleY)} />
      ))}

      {/* Sections */}
      {sections.map((section) => (
        <div
          key={section.id}
          style={{
            position: "absolute",
            left: `${section.x * scaleX}%`,
            top: `${section.y * scaleY}%`,
            width: `${section.width * scaleX}%`,
            height: `${section.height * scaleY}%`,
            background: `${section.color}15`,
            border: `1px solid ${section.color}40`,
            borderRadius: "2px",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: 3,
              fontSize: 9,
              fontWeight: 600,
              color: section.color,
              fontFamily: "var(--rialto-font-sans, system-ui)",
              lineHeight: 1,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {section.name}
          </span>
        </div>
      ))}

      {/* Tables */}
      {tables.map((table) => (
        <div
          key={table.id}
          style={{
            position: "absolute",
            left: `${table.x * scaleX}%`,
            top: `${table.y * scaleY}%`,
            width: `${table.width * scaleX}%`,
            height: `${table.height * scaleY}%`,
            background: "#8B7355",
            borderRadius: table.shape === "circle" ? "50%" : "3px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transform: `rotate(${table.rotation}deg)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 7,
              fontWeight: 700,
              color: "#d4cfc8",
              fontFamily: "var(--rialto-font-sans, system-ui)",
              lineHeight: 1,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {table.label}
          </span>
        </div>
      ))}
    </div>
  );
}
