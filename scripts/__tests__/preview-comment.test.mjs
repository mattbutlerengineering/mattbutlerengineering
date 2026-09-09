import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PREVIEW_COMMENT_AUTHOR,
  PREVIEW_COMMENT_MARKER,
  findPreviewCommentId,
  isPreviewComment,
  parseCommentLines,
} from "../preview-comment.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../preview-comment.mjs");

const BOT_BODY = `## ${PREVIEW_COMMENT_MARKER}\n\n- **Marketing**: https://x.workers.dev\n`;

const bot = (id, body = BOT_BODY) => ({ id, body, login: PREVIEW_COMMENT_AUTHOR });
const attacker = (id, body = BOT_BODY) => ({ id, body, login: "some-user" });

describe("isPreviewComment", () => {
  it("accepts a bot-authored comment containing the marker", () => {
    expect(isPreviewComment(bot(1))).toBe(true);
  });

  it("rejects a same-body comment from a non-bot author", () => {
    expect(isPreviewComment(attacker(1))).toBe(false);
  });

  it("rejects a bot comment without the marker, and junk shapes", () => {
    expect(isPreviewComment(bot(1, "unrelated"))).toBe(false);
    expect(isPreviewComment(null)).toBe(false);
    expect(isPreviewComment({})).toBe(false);
    expect(isPreviewComment({ login: PREVIEW_COMMENT_AUTHOR, body: 42 })).toBe(false);
  });
});

describe("findPreviewCommentId", () => {
  it("selects the bot's comment even when a non-bot match is older", () => {
    // Ascending created_at: the attacker pre-posted, so theirs comes first.
    expect(findPreviewCommentId([attacker(100), bot(200)])).toBe(200);
  });

  it("returns null when the only match is non-bot-authored", () => {
    expect(findPreviewCommentId([attacker(100)])).toBe(null);
  });

  it("returns the oldest bot match when several exist", () => {
    expect(findPreviewCommentId([bot(10), bot(20)])).toBe(10);
  });

  it("returns null for an empty or absent list", () => {
    expect(findPreviewCommentId([])).toBe(null);
    expect(findPreviewCommentId(undefined)).toBe(null);
  });
});

describe("parseCommentLines", () => {
  it("parses NDJSON and skips blank lines", () => {
    const text = `${JSON.stringify(bot(1))}\n\n${JSON.stringify(attacker(2))}\n`;
    expect(parseCommentLines(text)).toEqual([bot(1), attacker(2)]);
  });

  it("throws on an unparsable line rather than treating it as no match", () => {
    expect(() => parseCommentLines("not json")).toThrow();
  });
});

describe("CLI", () => {
  const run = (input) => execFileSync(process.execPath, [SCRIPT], { input, encoding: "utf8" });

  it("prints the bot comment id, ignoring an older attacker match", () => {
    const input = `${JSON.stringify(attacker(100))}\n${JSON.stringify(bot(200))}\n`;
    expect(run(input)).toBe("200\n");
  });

  it("prints nothing when no bot-authored match exists", () => {
    expect(run(`${JSON.stringify(attacker(100))}\n`)).toBe("");
    expect(run("")).toBe("");
  });

  it("exits nonzero on unparsable input", () => {
    expect(() => run("not json")).toThrow();
  });
});
