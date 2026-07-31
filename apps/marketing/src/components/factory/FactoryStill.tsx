import styles from "./FactorySection.module.css";

/**
 * The reduced-motion composition: the same factory floor, posed rather than
 * running. Six gate posts on the rail, work part-way through each stage — grey
 * before the tests, red inside them, green after — the gold pulse frozen
 * mid-sweep, and the feedback arc closing the loop back to intake.
 *
 * Decorative only; every stage, figure and label it depicts is also text in the
 * surrounding section.
 */

/** Matches the scene's design space: six gates on a six-column grid. */
const GATES = [0, 1, 2, 3, 4, 5].map((index) => ((2 * index + 1) / 12) * 1000);
const RAIL_Y = 90;

type Tone = "raw" | "fail" | "pass" | "accent";

interface StillDot {
  readonly x: number;
  readonly y: number;
  readonly tone: Tone;
  readonly r: number;
}

/** Work frozen along the line, one cluster per stage transition. */
const DOTS: readonly StillDot[] = [
  { x: 130, y: RAIL_Y, tone: "raw", r: 2.4 },
  { x: 178, y: RAIL_Y, tone: "raw", r: 2.4 },
  { x: 222, y: RAIL_Y, tone: "raw", r: 2.4 },
  { x: 292, y: RAIL_Y - 13, tone: "raw", r: 2.8 },
  { x: 300, y: RAIL_Y + 13, tone: "raw", r: 2.8 },
  { x: 348, y: RAIL_Y - 24, tone: "raw", r: 2.8 },
  { x: 356, y: RAIL_Y + 24, tone: "raw", r: 2.8 },
  { x: 392, y: RAIL_Y - 13, tone: "fail", r: 3 },
  { x: 400, y: RAIL_Y + 13, tone: "fail", r: 3 },
  { x: 452, y: RAIL_Y - 24, tone: "pass", r: 3 },
  { x: 460, y: RAIL_Y + 13, tone: "pass", r: 3 },
  { x: 522, y: RAIL_Y - 13, tone: "pass", r: 2.8 },
  { x: 548, y: RAIL_Y + 24, tone: "pass", r: 2.8 },
  { x: 606, y: RAIL_Y + 44, tone: "fail", r: 2.4 },
  { x: 664, y: RAIL_Y - 13, tone: "accent", r: 3.6 },
  { x: 690, y: RAIL_Y + 13, tone: "accent", r: 3.2 },
  { x: 772, y: RAIL_Y, tone: "pass", r: 3 },
  { x: 832, y: RAIL_Y, tone: "pass", r: 3 },
  { x: 878, y: RAIL_Y, tone: "pass", r: 3 },
];

const TONE_CLASS: Record<Tone, string> = {
  raw: styles.stillRaw!,
  fail: styles.stillFail!,
  pass: styles.stillPass!,
  accent: styles.stillAccent!,
};

export function FactoryStill() {
  return (
    <svg
      data-factory-still
      className={styles.still}
      viewBox="0 0 1000 300"
      preserveAspectRatio="none"
      focusable="false"
    >
      <line x1="20" y1={RAIL_Y} x2="980" y2={RAIL_Y} className={styles.stillRail} />

      {GATES.map((x) => (
        <line
          key={x}
          x1={x}
          y1={RAIL_Y - 22}
          x2={x}
          y2={RAIL_Y + 56}
          className={styles.stillPost}
        />
      ))}

      <path
        d={`M ${GATES[5]} ${RAIL_Y} Q 500 354 ${GATES[0]} ${RAIL_Y}`}
        className={styles.stillArc}
      />

      <circle cx={GATES[5]} cy={RAIL_Y} r="26" className={styles.stillBurst} />

      {DOTS.map((dot) => (
        <circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          className={TONE_CLASS[dot.tone]}
        />
      ))}
    </svg>
  );
}
