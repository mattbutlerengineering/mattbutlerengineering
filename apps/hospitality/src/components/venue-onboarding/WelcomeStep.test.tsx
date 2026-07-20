import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeStep } from "./WelcomeStep.js";
import type { BasicInfoData } from "./BasicInfoStep.js";

const emptyData: BasicInfoData = { name: "", slug: "", venueGroupId: "" };

describe("WelcomeStep", () => {
  it("renders a welcome heading and a one-line explainer", () => {
    render(<WelcomeStep data={emptyData} errors={{}} onChange={() => {}} />);

    expect(screen.getByText(/give your venue a home/i)).toBeInTheDocument();
    expect(screen.getByText(/booking page/i)).toBeInTheDocument();
  });

  it("renders the venue name and slug fields", () => {
    render(<WelcomeStep data={emptyData} errors={{}} onChange={() => {}} />);

    expect(screen.getByLabelText(/Venue Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Slug$/i)).toBeInTheDocument();
  });

  it("calls onChange with the typed name and an auto-generated slug", () => {
    const onChange = vi.fn();
    render(<WelcomeStep data={emptyData} errors={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/Venue Name/i), {
      target: { value: "The Grand Cafe" },
    });

    expect(onChange).toHaveBeenCalledWith({
      name: "The Grand Cafe",
      slug: "the-grand-cafe",
      venueGroupId: "",
    });
  });

  it("calls onChange when the slug field is edited directly", () => {
    const onChange = vi.fn();
    render(
      <WelcomeStep
        data={{ name: "Cafe", slug: "cafe", venueGroupId: "" }}
        errors={{}}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText(/^Slug$/i), { target: { value: "my-cafe" } });

    expect(onChange).toHaveBeenLastCalledWith({
      name: "Cafe",
      slug: "my-cafe",
      venueGroupId: "",
    });
  });

  it("shows the available state when the slug is free", () => {
    render(
      <WelcomeStep
        data={{ name: "Cafe", slug: "cafe", venueGroupId: "" }}
        errors={{}}
        onChange={() => {}}
        slugStatus="available"
      />
    );

    expect(screen.getByText(/slug is available/i)).toBeInTheDocument();
  });

  it("surfaces a taken-slug error", () => {
    render(
      <WelcomeStep
        data={{ name: "Cafe", slug: "cafe", venueGroupId: "" }}
        errors={{ slug: "A venue with this slug already exists" }}
        onChange={() => {}}
        slugStatus="taken"
      />
    );

    // The Input renders the error in both a visible hint and an aria-live region.
    expect(screen.getAllByText(/already exists/i).length).toBeGreaterThan(0);
  });
});
