import type { ReactNode } from "react";
import { cn } from "../../utils/class-composer";
import styles from "./NeonSign.module.css";

/** Shapes other than `classic`, each a composition of the parts below. */
export type NeonSignFramedShape = "swoosh" | "boxed" | "vertical" | "arrow" | "banner" | "vintage";

/** The tube spells one word; a dark OPEN reads as closed by shop-window convention. */
export const TUBE_WORD = "OPEN";

/** Geometry for the stretched frame tubes, in a 100 x 100 box that scales to the stage. */
const RING = <ellipse cx="50" cy="50" rx="48" ry="46" />;
const BOX = <rect x="2" y="2" width="96" height="96" rx="14" />;
/** Open on the bottom-start corner: the arrow ornament continues the tube from there. */
const ARROW_FRAME = <path d="M 6 96 V 4 H 94 V 96" />;
const STAR_PATH =
  "M12 2 L14.9 9 L22 9.6 L16.6 14.3 L18.2 21.5 L12 17.7 L5.8 21.5 L7.4 14.3 L2 9.6 L9.1 9 Z";
const ARROW_PATH = "M19 5 L5 19 M5 10 V19 H14";

interface PartProps {
  readonly lit: boolean;
}

/** An SVG tube: same lit/unlit contract as the word, drawn as a stroke. */
function StrokeTube({
  lit,
  part,
  className,
  viewBox,
  stretch = false,
  children,
}: PartProps & {
  readonly part: string;
  readonly className: string | undefined;
  readonly viewBox: string;
  readonly stretch?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <svg
      className={cn(styles.tube, styles.stroke, styles.frameTone, className)}
      data-tube="true"
      data-lit={lit}
      data-part={part}
      viewBox={viewBox}
      preserveAspectRatio={stretch ? "none" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function Word({ lit, framed }: PartProps & { readonly framed: boolean }) {
  return (
    <span
      className={cn(styles.tube, framed && styles.word)}
      data-tube="true"
      data-lit={lit}
      data-part={framed ? "word" : undefined}
    >
      {TUBE_WORD}
    </span>
  );
}

function Star({ lit }: PartProps) {
  return (
    <StrokeTube lit={lit} part="star" className={styles.ornament} viewBox="0 0 24 24">
      <path d={STAR_PATH} />
    </StrokeTube>
  );
}

function Rails() {
  return (
    <svg
      className={styles.rails}
      data-part="rails"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M 0 22 H 100 M 0 78 H 100 M 10 22 V 78 M 90 22 V 78" />
    </svg>
  );
}

interface ShapeProps extends PartProps {
  /** Localised script line for the banner shape. */
  readonly lead: string;
}

/** The parts of each framed shape, in DOM (and reading) order. */
export function ShapeParts({
  shape,
  lit,
  lead,
}: ShapeProps & { readonly shape: NeonSignFramedShape }) {
  const word = <Word lit={lit} framed />;
  switch (shape) {
    case "swoosh":
      return (
        <>
          <StrokeTube lit={lit} part="ring" className={styles.frame} viewBox="0 0 100 100" stretch>
            {RING}
          </StrokeTube>
          {word}
        </>
      );
    case "boxed":
      return (
        <>
          <StrokeTube lit={lit} part="frame" className={styles.frame} viewBox="0 0 100 100" stretch>
            {BOX}
          </StrokeTube>
          {word}
        </>
      );
    case "vertical":
      return (
        <>
          <StrokeTube lit={lit} part="frame" className={styles.frame} viewBox="0 0 100 100" stretch>
            {BOX}
          </StrokeTube>
          <Star lit={lit} />
          {word}
          <Star lit={lit} />
        </>
      );
    case "arrow":
      return (
        <>
          <StrokeTube lit={lit} part="frame" className={styles.frame} viewBox="0 0 100 100" stretch>
            {ARROW_FRAME}
          </StrokeTube>
          {word}
          <StrokeTube lit={lit} part="arrow" className={styles.ornament} viewBox="0 0 24 24">
            <path d={ARROW_PATH} />
          </StrokeTube>
        </>
      );
    case "banner":
      return (
        <>
          <span
            className={cn(styles.tube, styles.frameTone, styles.lead)}
            data-tube="true"
            data-lit={lit}
            data-part="lead"
          >
            {lead}
          </span>
          {word}
        </>
      );
    case "vintage":
      return (
        <>
          <Rails />
          {word}
        </>
      );
  }
}
