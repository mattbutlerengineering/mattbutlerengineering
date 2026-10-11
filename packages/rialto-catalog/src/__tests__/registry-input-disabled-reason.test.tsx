/**
 * The Input adapter must forward `disabledReason`. The catalog schema has no
 * `disabled` prop, so the reason has no DOM effect through the Renderer; spy on
 * the rialto Input to observe the forwarded prop directly.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";

const inputSpy = vi.fn((_props: Record<string, unknown>) => null);

vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Input: (props: Record<string, unknown>) => inputSpy(props),
}));

import { registry } from "../registry.js";

describe("Input adapter", () => {
  it("forwards disabledReason", () => {
    render(
      <JSONUIProvider registry={registry}>
        <Renderer
          registry={registry}
          spec={{
            root: "i1",
            elements: {
              i1: { type: "Input", props: { label: "Name", disabledReason: "Locked by admin" } },
            },
          }}
        />
      </JSONUIProvider>
    );
    expect(inputSpy).toHaveBeenCalledWith(
      expect.objectContaining({ disabledReason: "Locked by admin" })
    );
  });
});
