import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthMascot } from "./AuthMascot";

describe("AuthMascot", () => {
  it("renders with default neutral state", () => {
    render(<AuthMascot />);
    expect(screen.getByLabelText("Otter mascot")).toBeInTheDocument();
  });

  it("renders in shy state", () => {
    render(<AuthMascot state="shy" />);
    expect(screen.getByLabelText("Otter mascot")).toBeInTheDocument();
  });

  it("renders in success state", () => {
    render(<AuthMascot state="success" />);
    expect(screen.getByLabelText("Otter mascot")).toBeInTheDocument();
  });

  it("renders in peek state", () => {
    render(<AuthMascot state="peek" />);
    expect(screen.getByLabelText("Otter mascot")).toBeInTheDocument();
  });

  it("renders in active state", () => {
    render(<AuthMascot state="active" />);
    expect(screen.getByLabelText("Otter mascot")).toBeInTheDocument();
  });

  it("accepts progress prop", () => {
    render(<AuthMascot state="active" progress={0.5} />);
    expect(screen.getByLabelText("Otter mascot")).toBeInTheDocument();
  });
});
