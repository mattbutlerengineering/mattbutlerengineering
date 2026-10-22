import { useTranslation } from "react-i18next";
import { Button, Heading, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import type { WallLayout } from "@mbe/types";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clampThickness,
  createWall,
  snapToGrid,
} from "./floor-plan-geometry.js";
import styles from "./WallsPanel.module.css";

export interface WallsPanelProps {
  walls: readonly WallLayout[];
  selectedId: string | null;
  onChange: (walls: WallLayout[]) => void;
  onSelect: (wallId: string | null) => void;
}

type CoordKey = "x1" | "y1" | "x2" | "y2";

const clampTo = (v: number, max: number) => Math.min(Math.max(v, 0), max);

/**
 * The keyboard path for walls: every pointer affordance on the canvas (select, drag an endpoint,
 * re-thickness, delete, add) has a button or number field here.
 */
export function WallsPanel({ walls, selectedId, onChange, onSelect }: WallsPanelProps) {
  const { t } = useTranslation();
  const selected = walls.find((w) => w.id === selectedId) ?? null;

  const add = (kind: "wall" | "window") => {
    const wall = createWall(kind, walls);
    onChange([...walls, wall]);
    onSelect(wall.id);
  };

  const patch = (change: Partial<WallLayout>) =>
    onChange(walls.map((w) => (w.id === selectedId ? { ...w, ...change } : w)));

  const coord = (key: CoordKey, label: string, max: number) => (
    <Input
      label={label}
      type="number"
      value={selected ? selected[key] : ""}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) patch({ [key]: clampTo(snapToGrid(n), max) });
      }}
    />
  );

  return (
    <section className={styles.panel} aria-labelledby="walls-panel-title">
      <Heading id="walls-panel-title" className={styles.title}>
        {t("floorPlan.walls.title")}
      </Heading>
      <Stack gap="sm" direction="row">
        <Button onClick={() => add("wall")}>{t("floorPlan.walls.addWall")}</Button>
        <Button onClick={() => add("window")}>{t("floorPlan.walls.addWindow")}</Button>
      </Stack>

      {walls.length === 0 ? (
        <Text variant="caption" color="secondary">
          {t("floorPlan.walls.empty")}
        </Text>
      ) : (
        <Stack gap="xs">
          {walls.map((w, i) => (
            <Button
              key={w.id}
              aria-pressed={w.id === selectedId}
              onClick={() => onSelect(w.id === selectedId ? null : w.id)}
            >
              {t(w.wallType === "window" ? "floorPlan.walls.windowN" : "floorPlan.walls.wallN", {
                n: i + 1,
              })}
            </Button>
          ))}
        </Stack>
      )}

      {selected && (
        <Stack gap="sm">
          {coord("x1", t("floorPlan.walls.startX"), CANVAS_WIDTH)}
          {coord("y1", t("floorPlan.walls.startY"), CANVAS_HEIGHT)}
          {coord("x2", t("floorPlan.walls.endX"), CANVAS_WIDTH)}
          {coord("y2", t("floorPlan.walls.endY"), CANVAS_HEIGHT)}
          <Input
            label={t("floorPlan.walls.thickness")}
            type="number"
            value={selected.thickness}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) patch({ thickness: clampThickness(n) });
            }}
          />
          <Button
            onClick={() => {
              onChange(walls.filter((w) => w.id !== selected.id));
              onSelect(null);
            }}
          >
            {t("floorPlan.walls.delete")}
          </Button>
        </Stack>
      )}
    </section>
  );
}
