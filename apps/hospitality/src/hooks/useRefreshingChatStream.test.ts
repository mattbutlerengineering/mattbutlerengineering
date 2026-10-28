import { describe, it, expect, vi } from "vitest";
import { refreshAfterConfirm } from "./useRefreshingChatStream.js";

async function* lines(...values: unknown[]) {
  for (const value of values) yield value;
}

async function drain(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const value of iterable) out.push(value);
  return out;
}

describe("refreshAfterConfirm", () => {
  it("passes every line through and refreshes once a confirmed action's stream ends", async () => {
    const refresh = vi.fn();
    const stream = refreshAfterConfirm(() => lines({ type: "text" }, { type: "done" }), refresh);

    const out = await drain(
      stream({ url: "/agent", body: { messages: [], actionConfirm: { actionId: "a" } } })
    );

    expect(out).toEqual([{ type: "text" }, { type: "done" }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh after an ordinary message", async () => {
    const refresh = vi.fn();
    const stream = refreshAfterConfirm(() => lines({ type: "text" }), refresh);

    await drain(stream({ url: "/agent", body: { messages: [] } }));

    expect(refresh).not.toHaveBeenCalled();
  });

  it("still refreshes when a confirmed action's stream fails, since the write may have run", async () => {
    const refresh = vi.fn();
    const failing = async function* () {
      yield { type: "text" };
      throw new Error("socket closed");
    };
    const stream = refreshAfterConfirm(failing, refresh);

    await expect(
      drain(stream({ url: "/agent", body: { actionConfirm: { actionId: "a" } } }))
    ).rejects.toThrow("socket closed");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
