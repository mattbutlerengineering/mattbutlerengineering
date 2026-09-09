import { describe, it, expect } from "vitest";
import type { FastifyRequest } from "fastify";
import { createRawBodyCaptureHook } from "./raw-body-capture.js";

function fakeRequest(bodyLimit: number): FastifyRequest {
  return { server: { initialConfig: { bodyLimit } } } as unknown as FastifyRequest;
}

async function* toAsyncIterable(chunks: Buffer[]) {
  for (const chunk of chunks) yield chunk;
}

describe("createRawBodyCaptureHook", () => {
  it("captures the exact bytes into request.rawBody and returns a matching stream", async () => {
    const hook = createRawBodyCaptureHook();
    const request = fakeRequest(1024);
    const payload = toAsyncIterable([Buffer.from("hello "), Buffer.from("world")]);

    const stream = await hook.call({} as never, request, {} as never, payload as never);

    expect(request.rawBody).toEqual(Buffer.from("hello world"));
    const streamed: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      streamed.push(chunk as Buffer);
    }
    expect(Buffer.concat(streamed)).toEqual(Buffer.from("hello world"));
  });

  it("rejects a body that exceeds the configured bodyLimit before fully buffering", async () => {
    const hook = createRawBodyCaptureHook();
    const request = fakeRequest(10);
    const payload = toAsyncIterable([Buffer.from("this chunk is way over the ten byte limit")]);

    await expect(
      hook.call({} as never, request, {} as never, payload as never)
    ).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it("falls back to Fastify's default 1 MiB limit when bodyLimit is unset", async () => {
    const hook = createRawBodyCaptureHook();
    const request = {
      server: { initialConfig: {} },
    } as unknown as FastifyRequest;
    const oversized = Buffer.alloc(1048576 + 1, "a");
    const payload = toAsyncIterable([oversized]);

    await expect(
      hook.call({} as never, request, {} as never, payload as never)
    ).rejects.toMatchObject({
      statusCode: 413,
    });
  });
});
