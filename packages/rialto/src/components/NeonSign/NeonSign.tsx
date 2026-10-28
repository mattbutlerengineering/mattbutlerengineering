import { forwardRef, type HTMLAttributes } from "react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import styles from "./NeonSign.module.css";
import { ShapeParts, Word, type NeonSignFramedShape } from "./NeonSignParts";

/**
 * Trading state the sign shows.
 * - `open` — the tube is lit with the success token and strikes on when entered.
 * - `opening-soon` — the tube warms gold and breathes; doors open within the lead window.
 * - `closed` — dark glass on the plate.
 * - `unset` — no tube, dashed outline: hours were never configured.
 */
export type NeonSignState = "open" | "opening-soon" | "closed" | "unset";

/** Neon tube colours, each a `--rialto-neon-*` token. */
export type NeonTone = "red" | "pink" | "blue" | "green" | "orange" | "purple";

/** Colour of the word and, on shapes that have one, of the frame tubes around it. */
export interface NeonSignTone {
  word: NeonTone;
  /** Frame, ring, stars, arrow and banner lead. Defaults to the shape's own frame tone. */
  frame?: NeonTone;
}

/** Look of the sign — see `NeonSignProps.shape`. */
export type NeonSignShape = "classic" | NeonSignFramedShape;

/**
 * Instrument that shows whether a venue is trading right now — a neon tube
 * spelling OPEN mounted on a recessed housing, with the fact stated in words
 * beneath it. The tube is lit green while open, warms gold while opening
 * soon (the one place the accent appears), sits dark when closed, and is
 * absent altogether when no hours are set.
 *
 * It owns no clock and no timezone: the consumer derives `state` and the
 * label; the instrument prints `OPEN` and whatever `aria-label` it is given.
 * Motion is CSS keyframes bound to `data-state`, so the strike-on needs no
 * React state or effect.
 *
 * Renders as a single `role="img"` — housing, tube and caption are decorative
 * and assistive tech hears only the required `aria-label`.
 *
 * @example
 * <NeonSign state="open" aria-label="Open until 10:00 PM" />
 * <NeonSign state="open" shape="boxed" aria-label="Open until 10:00 PM" />
 */
export interface NeonSignProps extends Omit<HTMLAttributes<HTMLDivElement>, "aria-label"> {
  /** Accessible name — required because the component renders as role="img". Also the visible caption. */
  "aria-label": string;
  /** Trading state the tube shows. Required: a sign with no state would be a lie. */
  state: NeonSignState;
  /** Print the accessible name as a caption beneath the housing. @default true */
  showCaption?: boolean;
  /** Tube, housing padding and caption scale together. @default "md" */
  size?: "sm" | "md" | "lg";
  /**
   * Look of the sign. `classic` is the block OPEN on the housing; the others add
   * frame tubes drawn as SVG strokes. `vertical` and `arrow` are taller than wide
   * (roughly 1:3, width to height); the rest are wider than tall. All scale with `size`.
   * @default "classic"
   */
  shape?: NeonSignShape;
  /**
   * Tube colours from the `--rialto-neon-*` tokens. Omitted, `classic` keeps its
   * state-driven colours (success while open, accent while opening soon) and every
   * other shape uses its own default tones. `state` still decides whether tubes are lit.
   */
  tone?: NeonSignTone;
}

/** Default tones per framed shape; `classic` has none and keeps the state colours. */
const SHAPE_TONES: Readonly<Record<NeonSignFramedShape, NeonSignTone>> = {
  swoosh: { word: "pink", frame: "blue" },
  boxed: { word: "red", frame: "blue" },
  vertical: { word: "green", frame: "pink" },
  arrow: { word: "orange", frame: "blue" },
  banner: { word: "red", frame: "blue" },
  vintage: { word: "orange" },
};

const SHAPE_CLASS: Readonly<Record<NeonSignFramedShape, string | undefined>> = {
  swoosh: styles.shapeSwoosh,
  boxed: styles.shapeBoxed,
  vertical: styles.shapeVertical,
  arrow: styles.shapeArrow,
  banner: styles.shapeBanner,
  vintage: styles.shapeVintage,
};

const SIZE_CLASS = { sm: styles.sizeSm, md: styles.sizeMd, lg: styles.sizeLg } as const;

export const NeonSign = forwardRef<HTMLDivElement, NeonSignProps>(
  (
    {
      "aria-label": ariaLabel,
      state,
      showCaption = true,
      size = "md",
      shape = "classic",
      tone,
      className,
      ...rest
    },
    ref
  ) => {
    const { reduced: shouldReduceMotion } = useMotionPreset();
    const { messages } = useRialtoLocale();
    const lit = state === "open" || state === "opening-soon";
    const defaults = shape === "classic" ? undefined : SHAPE_TONES[shape];

    const rootClass = cn(
      styles.neonSign,
      SIZE_CLASS[size],
      shouldReduceMotion && styles.reduced,
      className
    );

    return (
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        data-state={state}
        data-shape={shape}
        data-word-tone={tone?.word ?? defaults?.word}
        data-frame-tone={tone?.frame ?? defaults?.frame}
        data-reduced-motion={shouldReduceMotion}
        className={rootClass}
        {...rest}
      >
        <div className={styles.housing} aria-hidden="true">
          {shape === "classic" ? (
            <Word lit={lit} framed={false} />
          ) : (
            <div className={cn(styles.stage, SHAPE_CLASS[shape])}>
              <ShapeParts shape={shape} lit={lit} lead={messages.neonSignLead} />
            </div>
          )}
        </div>
        {showCaption && (
          <span className={styles.caption} aria-hidden="true">
            {ariaLabel}
          </span>
        )}
      </div>
    );
  }
);

NeonSign.displayName = "NeonSign";
