import { describe, it, expect } from "vitest";
import {
  isShippedVideosFile,
  selectShippedVideos,
  findShippedVideoIn,
  latestShippedVideoIn,
} from "./shipped-videos.js";

const video = (over: Record<string, unknown> = {}) => ({
  slug: "demo",
  src: "/videos/demo.mp4",
  title: "Demo tour",
  transcript: "What it is and what it does.",
  recordedAt: "2026-11-13",
  ...over,
});

describe("isShippedVideosFile", () => {
  it("accepts an empty list", () => {
    expect(isShippedVideosFile({ videos: [] })).toBe(true);
  });

  it("accepts a valid video", () => {
    expect(isShippedVideosFile({ videos: [video()] })).toBe(true);
  });

  it.each([
    ["non-object", "nope"],
    ["null", null],
    ["missing videos", {}],
    ["videos not an array", { videos: "x" }],
    ["empty slug", { videos: [video({ slug: "" })] }],
    ["empty title", { videos: [video({ title: "" })] }],
    ["empty transcript", { videos: [video({ transcript: "" })] }],
    ["bad date", { videos: [video({ recordedAt: "soon" })] }],
    ["off-origin src", { videos: [video({ src: "https://cdn.example.com/a.mp4" })] }],
    ["protocol-relative src", { videos: [video({ src: "//cdn.example.com/a.mp4" })] }],
    ["src outside /videos/", { videos: [video({ src: "/assets/a.mp4" })] }],
    ["src not mp4", { videos: [video({ src: "/videos/a.mov" })] }],
    ["path traversal src", { videos: [video({ src: "/videos/../a.mp4" })] }],
  ])("rejects %s", (_name, raw) => {
    expect(isShippedVideosFile(raw)).toBe(false);
  });
});

describe("selectShippedVideos", () => {
  it("returns [] for a malformed file instead of throwing", () => {
    expect(selectShippedVideos({ videos: [video({ src: "http://x/a.mp4" })] })).toEqual([]);
    expect(selectShippedVideos(undefined)).toEqual([]);
  });

  it("sorts newest recordedAt first", () => {
    const sorted = selectShippedVideos({
      videos: [
        video({ slug: "a", recordedAt: "2026-10-01" }),
        video({ slug: "b", recordedAt: "2026-11-01" }),
      ],
    });
    expect(sorted.map((v) => v.slug)).toEqual(["b", "a"]);
  });
});

describe("findShippedVideoIn / latestShippedVideoIn", () => {
  const videos = selectShippedVideos({
    videos: [
      video({ slug: "a", recordedAt: "2026-10-01" }),
      video({ slug: "b", recordedAt: "2026-11-01" }),
    ],
  });

  it("finds by slug", () => {
    expect(findShippedVideoIn(videos, "a")?.slug).toBe("a");
    expect(findShippedVideoIn(videos, "zzz")).toBeUndefined();
  });

  it("returns the newest, or undefined when empty", () => {
    expect(latestShippedVideoIn(videos)?.slug).toBe("b");
    expect(latestShippedVideoIn([])).toBeUndefined();
  });
});
