import { Letterboard } from "@mattbutlerengineering/rialto";
import { ROADMAP } from "../../data/service-night";
import { SceneShell } from "./SceneShell";

/** Longest row the letterboard holds on a phone without wrapping mid-word. */
const BOARD_ROW_MAX = 15;

/** An idea's name as a board row: upper-cased by the board, whole words only. */
function boardRow(label: string): string {
  return label
    .replace(/-/g, " ")
    .split(" ")
    .reduce((row, word) => {
      const next = row ? `${row} ${word}` : word;
      return next.length <= BOARD_ROW_MAX ? next : row;
    }, "");
}

const BOARD_LINES = [
  [{ text: "Coming next", accent: true }],
  ...ROADMAP.map((idea) => boardRow(idea.label)),
] as const;

export function RoadmapScene() {
  return (
    <SceneShell sceneId="roadmap" claims={ROADMAP}>
      <Letterboard lines={BOARD_LINES} size="sm" />
    </SceneShell>
  );
}
