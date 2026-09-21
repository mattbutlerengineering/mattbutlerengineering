import { forwardRef, Fragment, type HTMLAttributes } from "react";
import { cn } from "../../utils/class-composer";
import { toSegments, toTiles, type LetterboardLine } from "./tiles";
import styles from "./Letterboard.module.css";

/**
 * A vintage diner letterboard: one moulded letter piece per character, slotted
 * into the ridges of a recessed plate.
 *
 * @example
 * <Letterboard lines={["TODAY ONLY", [{ text: "OYSTERS " }, { text: "$1", accent: true }]]} />
 */
export interface LetterboardProps extends HTMLAttributes<HTMLDivElement> {
  /** One entry per ridge, top to bottom. */
  lines: readonly LetterboardLine[];
  /** Letter-piece scale. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Where each row sits on its ridge. @default "center" */
  align?: "start" | "center" | "end";
}

const SIZE_CLASS = { sm: styles.sizeSm, md: styles.sizeMd, lg: styles.sizeLg } as const;
const ALIGN_CLASS = {
  start: styles.alignStart,
  center: styles.alignCenter,
  end: styles.alignEnd,
} as const;

export const Letterboard = forwardRef<HTMLDivElement, LetterboardProps>(
  ({ lines, size = "md", align = "center", className, ...rest }, ref) => {
    // One model per row, rendered twice: as words for assistive tech, as
    // letter pieces for the eye.
    const rows = lines.map((line) => ({ runs: toSegments(line), pieces: toTiles(line) }));

    return (
      <div
        ref={ref}
        className={cn(styles.letterboard, SIZE_CLASS[size], ALIGN_CLASS[align], className)}
        {...rest}
      >
        {/* The sign's words as ordinary text — the only thing assistive tech
            reads. Visually hidden: the plate below is the visible rendering. */}
        <div className={styles.reading}>
          {rows.map((row, rowIndex) => (
            <p key={rowIndex}>
              {row.runs.map((run, index) =>
                run.accent ? (
                  <strong key={index}>{run.text}</strong>
                ) : (
                  <Fragment key={index}>{run.text}</Fragment>
                )
              )}
            </p>
          ))}
        </div>

        <div className={styles.plate} aria-hidden="true">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className={styles.slot}>
              <div className={styles.letters}>
                {row.pieces.map((piece, index) =>
                  piece.empty ? (
                    <span key={index} className={styles.space} />
                  ) : (
                    <span key={index} className={styles.tile} data-accent={piece.accent}>
                      {piece.char}
                    </span>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
);

Letterboard.displayName = "Letterboard";
