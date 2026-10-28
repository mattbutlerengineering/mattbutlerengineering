import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { TableDisplayStatus } from "./table-status.js";
import {
  GLYPH_STROKE_WIDTH,
  GLYPH_VIEWBOX,
  STATUS_GLYPHS,
  STATUS_GLYPH_KEYS,
  STATUS_LABEL_KEY,
  statusFillToken,
} from "./table-status-glyph.js";
import styles from "./TableStatusLegend.module.css";

export interface TableStatusLegendProps {
  /** The canvas's live statuses; undefined (editor-only usage) hides the legend. */
  statuses: ReadonlyMap<string, TableDisplayStatus> | undefined;
}

/**
 * Explains the canvas: each status's colour and the glyph that backs it up, so
 * colour is never the only cue. Swatches and glyphs are decorative here; the
 * entry's text is the only thing read.
 */
export function TableStatusLegend({ statuses }: TableStatusLegendProps) {
  const { t } = useTranslation();
  if (statuses === undefined) return null;
  return (
    <ul className={styles.legend} aria-label={t("floorPlan.statusLegend.title")}>
      {STATUS_GLYPH_KEYS.map((key) => {
        const glyph = STATUS_GLYPHS[key];
        return (
          <li key={key} className={styles.item}>
            <Text
              className={styles.swatch}
              style={{ background: statusFillToken(key) }}
              data-swatch=""
              aria-hidden="true"
            />
            <svg
              className={styles.glyph}
              viewBox={`0 0 ${GLYPH_VIEWBOX} ${GLYPH_VIEWBOX}`}
              aria-hidden="true"
              focusable="false"
            >
              <path
                d={glyph.path}
                fill={glyph.filled ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={GLYPH_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <Text className={styles.label}>{t(STATUS_LABEL_KEY[key])}</Text>
          </li>
        );
      })}
    </ul>
  );
}
