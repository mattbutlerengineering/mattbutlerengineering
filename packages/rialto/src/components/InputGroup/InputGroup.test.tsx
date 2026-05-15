import { render, screen } from "@testing-library/react";
import { InputGroup } from "./InputGroup";

describe("InputGroup", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(
        <InputGroup>
          <input type="text" placeholder="Search..." />
        </InputGroup>
      );
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });

    it("renders multiple children", () => {
      render(
        <InputGroup>
          <input type="text" placeholder="URL" />
          <button type="button">Go</button>
        </InputGroup>
      );
      expect(screen.getByPlaceholderText("URL")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
    });

    it("renders with role=group", () => {
      render(
        <InputGroup aria-label="Search group">
          <input type="text" />
        </InputGroup>
      );
      expect(screen.getByRole("group", { name: "Search group" })).toBeInTheDocument();
    });

    it("applies group CSS class", () => {
      const { container } = render(
        <InputGroup>
          <input type="text" />
        </InputGroup>
      );
      expect(container.firstElementChild?.className).toMatch(/group/);
    });

    it("forwards custom className", () => {
      const { container } = render(
        <InputGroup className="my-group">
          <input type="text" />
        </InputGroup>
      );
      expect(container.firstElementChild?.className).toMatch(/my-group/);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <InputGroup ref={ref}>
          <input type="text" />
        </InputGroup>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("HTML attribute forwarding", () => {
    it("forwards aria-label", () => {
      render(
        <InputGroup aria-label="URL entry">
          <input type="text" />
        </InputGroup>
      );
      expect(screen.getByRole("group")).toHaveAttribute("aria-label", "URL entry");
    });

    it("forwards data-testid", () => {
      render(
        <InputGroup data-testid="search-group">
          <input type="text" />
        </InputGroup>
      );
      expect(screen.getByTestId("search-group")).toBeInTheDocument();
    });

    it("renders as a div element", () => {
      const { container } = render(
        <InputGroup>
          <input type="text" />
        </InputGroup>
      );
      expect(container.firstElementChild?.tagName).toBe("DIV");
    });
  });

  describe("without className", () => {
    it("renders only the group CSS class when no className provided", () => {
      const { container } = render(
        <InputGroup>
          <input type="text" />
        </InputGroup>
      );
      // className should contain the module class but no extra tokens
      expect(container.firstElementChild?.className).not.toMatch(/undefined/);
    });
  });
});
