/**
 * A small, non-interactive picture of one room template — its walls, section
 * zones and tables — used by `TemplatePicker`'s cards and by the venue
 * onboarding floor-plan step.
 *
 * Ported from eat-sheet's `TemplateMiniPreview` (#7256). Everything is
 * positioned as a percentage of the layout's own canvas, so one component
 * serves a 120 px thumbnail and a half-page preview without a measurement
 * pass — no `ResizeObserver`, no state, and therefore nothing to sync in an
 * effect (rialto's setState-in-effect ban, see `.claude/rules/gotchas.md`).
 *
 * Geometry comes from the layout; the only inline styles are data-driven
 * (position, size, and a section's own colour). Everything else is a rialto
 * token in the sibling CSS module.
 */

import { useTranslation } from "react-i18next";
import type { CSSProperties, JSX } from "react";
import { Text } from "@mattbutlerengineering/rialto";
import type { WallLayout } from "@mbe/types";
import type { RoomLayout, RoomTemplateSection, RoomTemplateTable } from "./room-templates.js";
import styles from "./TemplateMiniPreview.module.css";

export interface TemplateMiniPreviewProps {
  readonly layout: RoomLayout;
  readonly className?: string;
  /** Replaces the derived screen-reader description, e.g. with the card's own name. */
  readonly ariaLabel?: string;
  /**
   * Hides the picture from assistive tech. Set it where the surrounding
   * control already names the template — a picker card reading out the whole
   * layout before its own label is noise, not information.
   */
  readonly decorative?: boolean;
}

interface Scale {
  readonly x: (value: number) => number;
  readonly y: (value: number) => number;
}

/** A zero-sized canvas would scale to NaN, so it collapses to zero instead. */
function scaleFor(layout: RoomLayout): Scale {
  return {
    x: (value) => (layout.width > 0 ? (value / layout.width) * 100 : 0),
    y: (value) => (layout.height > 0 ? (value / layout.height) * 100 : 0),
  };
}

/** A wall is a line; it is drawn as the thinnest rectangle covering that line. */
function wallStyle(wall: WallLayout, scale: Scale): CSSProperties {
  const spanX = Math.abs(wall.x2 - wall.x1);
  const spanY = Math.abs(wall.y2 - wall.y1);
  const horizontal = spanX >= spanY;

  return {
    left: `${scale.x(Math.min(wall.x1, wall.x2))}%`,
    top: `${scale.y(Math.min(wall.y1, wall.y2))}%`,
    width: horizontal ? `${scale.x(spanX)}%` : `${scale.x(wall.thickness)}%`,
    height: horizontal ? `${scale.y(wall.thickness)}%` : `${scale.y(spanY)}%`,
    minWidth: horizontal ? undefined : "1px",
    minHeight: horizontal ? "1px" : undefined,
  };
}

function sectionStyle(section: RoomTemplateSection, scale: Scale): CSSProperties {
  return {
    left: `${scale.x(section.x)}%`,
    top: `${scale.y(section.y)}%`,
    width: `${scale.x(section.width)}%`,
    height: `${scale.y(section.height)}%`,
    background: `${section.color}22`,
    borderColor: `${section.color}66`,
  };
}

/** The layout stores a table's centre; CSS positions its top-left corner. */
function tableStyle(table: RoomTemplateTable, scale: Scale): CSSProperties {
  return {
    left: `${scale.x(table.x - table.width / 2)}%`,
    top: `${scale.y(table.y - table.height / 2)}%`,
    width: `${scale.x(table.width)}%`,
    height: `${scale.y(table.height)}%`,
    transform: table.rotation === 0 ? undefined : `rotate(${table.rotation}deg)`,
  };
}

export function TemplateMiniPreview({
  layout,
  className,
  ariaLabel,
  decorative = false,
}: TemplateMiniPreviewProps): JSX.Element {
  const { t } = useTranslation();
  const scale = scaleFor(layout);

  const description =
    ariaLabel ??
    (layout.tables.length === 0 && layout.sections.length === 0
      ? t("floorPlan.templates.previewEmpty")
      : t("floorPlan.templates.preview", {
          tables: t("floorPlan.templates.tableCount", { count: layout.tables.length }),
          sections: t("floorPlan.templates.sectionCount", { count: layout.sections.length }),
        }));

  const labelling = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": description } as const);

  return (
    <div
      {...labelling}
      className={className ? `${styles.preview} ${className}` : styles.preview}
      // The room's own proportions, set directly rather than through a custom
      // property: the box is sized by data, and a property defined only here
      // reads as undefined to anything that checks CSS for its definition.
      style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      {layout.walls.map((wall) => (
        <div
          key={wall.id}
          data-preview="wall"
          data-preview-id={wall.id}
          className={wall.wallType === "window" ? styles.window : styles.wall}
          style={wallStyle(wall, scale)}
        />
      ))}

      {layout.sections.map((section) => (
        <div
          key={section.id}
          data-preview="section"
          data-preview-id={section.id}
          className={styles.section}
          style={sectionStyle(section, scale)}
        >
          {/* The zone's own colour is data, like SectionZone's label on the canvas. */}
          <Text
            as="span"
            variant="detail"
            className={styles.sectionName}
            style={{ color: section.color }}
          >
            {section.name}
          </Text>
        </div>
      ))}

      {layout.tables.map((table) => (
        <div
          key={table.id}
          data-preview="table"
          data-preview-id={table.id}
          className={`${styles.table} ${table.shape === "circle" ? styles.round : styles.rect}`}
          style={tableStyle(table, scale)}
        />
      ))}
    </div>
  );
}
