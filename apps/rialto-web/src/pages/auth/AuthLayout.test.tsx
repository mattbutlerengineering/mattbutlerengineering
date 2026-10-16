import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthLayout } from "./AuthLayout";

describe("AuthLayout", () => {
  it("renders the title as the page's level-one heading", () => {
    render(
      <MemoryRouter>
        <AuthLayout title="Sign in to your account" footer={<span>footer</span>}>
          <div>form</div>
        </AuthLayout>
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in to your account" })
    ).toBeInTheDocument();
  });
});
