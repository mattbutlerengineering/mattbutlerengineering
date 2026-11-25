import { NIGHTS } from "./nights.js";
import { passesBar } from "./pass-bar.js";
import { replayNight } from "./replay.js";
import { aggregate, scoreNight, type NightScore } from "./scorer.js";
import type { Night, Proposer } from "./types.js";

export interface HarnessReport {
  proposer: string;
  nights: NightScore[];
  aggregate: NightScore;
  passed: boolean;
}

export function runHarness(proposer: Proposer, nights: readonly Night[] = NIGHTS): HarnessReport {
  const scores = nights.map((night) => scoreNight(night, replayNight(night, proposer)));
  const total = aggregate(scores);
  return { proposer: proposer.name, nights: scores, aggregate: total, passed: passesBar(total) };
}
