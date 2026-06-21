import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { z } from "zod";
import { ApiClientError } from "@mbe/api-client";
import { useFormState } from "./use-form-state.js";

const guestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").or(z.literal("")),
});

type GuestForm = z.infer<typeof guestSchema>;

const INITIAL: GuestForm = { name: "", email: "" };

describe("useFormState - submit success", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() =>
      useFormState(INITIAL, vi.fn().mockResolvedValue(undefined), guestSchema)
    );
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets isPending during submit", async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "" }, onSubmit, guestSchema)
    );

    act(() => {
      result.current.handleSubmit();
    });
    expect(result.current.isPending).toBe(true);
    await act(async () => {
      resolve();
    });
    expect(result.current.isPending).toBe(false);
  });

  it("calls onSubmit with current field values on success", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "" }, onSubmit, guestSchema)
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: "Alice", email: "" });
  });

  it("clears error on successful submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "" }, onSubmit, guestSchema)
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.error).toBeNull();
  });

  it("ignores handleSubmit if already pending", async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "" }, onSubmit, guestSchema)
    );

    act(() => {
      result.current.handleSubmit();
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve();
    });
  });
});

describe("useFormState - submit failure", () => {
  it("sets error when onSubmit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Server error"));
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "" }, onSubmit, guestSchema)
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.error).toBe("Server error");
    expect(result.current.isPending).toBe(false);
  });

  it("uses fallback message when error has no message", async () => {
    const onSubmit = vi.fn().mockRejectedValue("oops");
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "" }, onSubmit, guestSchema)
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(typeof result.current.error).toBe("string");
    expect((result.current.error?.length ?? 0) > 0).toBe(true);
  });

  it("uses problemDetails.detail (not debug message) when error is ApiClientError", async () => {
    const apiError = new ApiClientError(
      {
        error: "Validation Error",
        message: "Validation failed",
        statusCode: 422,
        detail: "Name is required",
        status: 422,
      },
      "PATCH",
      "/api/v1/guests/123"
    );
    const onSubmit = vi.fn().mockRejectedValue(apiError);
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "" }, onSubmit, guestSchema)
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    // Should show the clean detail, not the debug string like "PATCH /api/v1/guests/123 failed: 422 ..."
    expect(result.current.error).toBe("Name is required");
    expect(result.current.error).not.toContain("PATCH /api/v1/guests/123 failed");
  });
});

describe("useFormState - validation failure", () => {
  it("does not call onSubmit when schema rejects", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    // name is empty — fails min(1)
    const { result } = renderHook(() =>
      useFormState({ name: "", email: "" }, onSubmit, guestSchema)
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sets error when schema rejects", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFormState({ name: "", email: "" }, onSubmit, guestSchema)
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(typeof result.current.error).toBe("string");
    expect((result.current.error?.length ?? 0) > 0).toBe(true);
  });

  it("does not call onSubmit when email format is invalid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "not-valid" }, onSubmit, guestSchema)
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("useFormState - field updates and dirty tracking", () => {
  it("updates a field via setField", () => {
    const { result } = renderHook(() => useFormState(INITIAL, vi.fn(), guestSchema));

    act(() => {
      result.current.setField("name", "Bob");
    });

    expect(result.current.fields.name).toBe("Bob");
  });

  it("is dirty when a field differs from initial", () => {
    const { result } = renderHook(() => useFormState(INITIAL, vi.fn(), guestSchema));

    act(() => {
      result.current.setField("name", "Bob");
    });

    expect(result.current.isDirty).toBe(true);
  });

  it("is not dirty when fields match initial", () => {
    const { result } = renderHook(() =>
      useFormState({ name: "Bob", email: "" }, vi.fn(), guestSchema)
    );
    expect(result.current.isDirty).toBe(false);
  });

  it("reset restores fields to initial and clears error", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() =>
      useFormState({ name: "Alice", email: "" }, onSubmit, guestSchema)
    );

    // trigger error
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.error).not.toBeNull();

    // mutate a field
    act(() => {
      result.current.setField("name", "Changed");
    });

    // reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.fields.name).toBe("Alice");
    expect(result.current.error).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });
});
