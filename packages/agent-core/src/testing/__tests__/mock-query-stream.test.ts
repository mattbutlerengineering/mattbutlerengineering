import { describe, it, expect } from "vitest";
import { createMockQueryStream } from "../index.js";

async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("createMockQueryStream", () => {
  it("yields all provided messages in order", async () => {
    const messages = [
      { type: "system", subtype: "init" },
      { type: "result", subtype: "success" },
    ];
    const results = await drain(createMockQueryStream(messages));
    expect(results).toHaveLength(2);
    expect((results[0] as { type: string }).type).toBe("system");
    expect((results[1] as { type: string }).type).toBe("result");
  });

  it("yields nothing for an empty array", async () => {
    const results = await drain(createMockQueryStream([]));
    expect(results).toHaveLength(0);
  });
});
