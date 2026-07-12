import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { validateSettings, RECOMMENDED_SETTINGS, SettingsStep } from "./SettingsStep.js";

describe("validateSettings", () => {
  it("allows all fields to be blank", () => {
    const errors = validateSettings({
      defaultReservationDuration: "",
      maxPartySize: "",
      advanceBookingDays: "",
    });
    expect(errors).toEqual({});
  });

  it("rejects a non-positive reservation duration", () => {
    const errors = validateSettings({
      defaultReservationDuration: "-5",
      maxPartySize: "",
      advanceBookingDays: "",
    });
    expect(errors.defaultReservationDuration).toBe("Duration must be a positive number");
  });

  it("rejects a non-positive max party size", () => {
    const errors = validateSettings({
      defaultReservationDuration: "",
      maxPartySize: "0",
      advanceBookingDays: "",
    });
    expect(errors.maxPartySize).toBe("Party size must be a positive number");
  });

  it("rejects a non-positive advance booking window", () => {
    const errors = validateSettings({
      defaultReservationDuration: "",
      maxPartySize: "",
      advanceBookingDays: "abc",
    });
    expect(errors.advanceBookingDays).toBe("Advance days must be a positive number");
  });

  it("returns no errors for valid positive values", () => {
    const errors = validateSettings({
      defaultReservationDuration: "60",
      maxPartySize: "8",
      advanceBookingDays: "30",
    });
    expect(errors).toEqual({});
  });
});

describe("SettingsStep", () => {
  it("renders with the recommended defaults pre-filled", () => {
    render(
      <SettingsStep
        data={RECOMMENDED_SETTINGS}
        errors={{}}
        onChange={() => {}}
        onAdvance={() => {}}
      />
    );

    expect(screen.getByLabelText(/Default Reservation Duration/i)).toHaveValue(
      Number(RECOMMENDED_SETTINGS.defaultReservationDuration)
    );
    expect(screen.getByLabelText(/Maximum Party Size/i)).toHaveValue(
      Number(RECOMMENDED_SETTINGS.maxPartySize)
    );
    expect(screen.getByLabelText(/Advance Booking Window/i)).toHaveValue(
      Number(RECOMMENDED_SETTINGS.advanceBookingDays)
    );
  });

  it("clicking 'Use recommended settings' applies the recommended values and advances", async () => {
    const onChange = vi.fn();
    const onAdvance = vi.fn();
    render(
      <SettingsStep
        data={{ defaultReservationDuration: "", maxPartySize: "", advanceBookingDays: "" }}
        errors={{}}
        onChange={onChange}
        onAdvance={onAdvance}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /use recommended settings/i }));

    expect(onChange).toHaveBeenCalledWith(RECOMMENDED_SETTINGS);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("still allows manual editing of individual fields", async () => {
    const onChange = vi.fn();
    render(
      <SettingsStep
        data={RECOMMENDED_SETTINGS}
        errors={{}}
        onChange={onChange}
        onAdvance={() => {}}
      />
    );

    const maxPartyInput = screen.getByLabelText(/Maximum Party Size/i);
    fireEvent.change(maxPartyInput, { target: { value: "4" } });

    expect(onChange).toHaveBeenLastCalledWith({
      ...RECOMMENDED_SETTINGS,
      maxPartySize: "4",
    });
  });
});
