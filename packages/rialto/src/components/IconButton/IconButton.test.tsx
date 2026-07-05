import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconButton } from "./IconButton";

const StarIcon = () => (
  <svg data-testid="star" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1l2 5 5 .5-4 3 1 5-4-3-4 3 1-5-4-3 5-.5z" />
  </svg>
);

describe("IconButton", () => {
  describe("rendering", () => {
    it("renders a single button element", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" />);
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });

    it("exposes the given aria-label as the accessible name", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" />);
      expect(screen.getByRole("button", { name: "Favourite" })).toBeInTheDocument();
    });

    it("renders the provided icon inside the button", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" />);
      const button = screen.getByRole("button");
      expect(button.querySelector('[data-testid="star"]')).toBeInTheDocument();
    });

    it("applies the iconButton class", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" />);
      expect(screen.getByRole("button").className).toMatch(/iconButton/);
    });
  });

  describe("composes Button", () => {
    it("renders Button's base class rather than a bespoke button", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" />);
      // The Button primitive contributes its own `button` base class — proof
      // that IconButton composes Button instead of duplicating its semantics.
      expect(screen.getByRole("button").className).toMatch(/\bbutton\b/);
    });

    it("defaults to the ghost variant", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" />);
      expect(screen.getByRole("button").className).toMatch(/ghost/);
    });

    it("forwards a variant through to Button", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" variant="primary" />);
      expect(screen.getByRole("button").className).toMatch(/primary/);
    });

    it("inherits Button's disabled handling", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" disabled />);
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("sizing", () => {
    it("has no explicit size class at the default md size", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" />);
      expect(screen.getByRole("button").className).not.toMatch(/\bsm\b|\blg\b/);
    });

    it("applies the sm size class", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" size="sm" />);
      expect(screen.getByRole("button").className).toMatch(/\bsm\b/);
    });

    it("applies the lg size class", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" size="lg" />);
      expect(screen.getByRole("button").className).toMatch(/\blg\b/);
    });
  });

  describe("behaviour", () => {
    it("defaults to type=button", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" />);
      expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    });

    it("allows the type to be overridden", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Submit" type="submit" />);
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    });

    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" onClick={onClick} />);
      await user.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("forwards additional className", () => {
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" className="toolbar-btn" />);
      expect(screen.getByRole("button").className).toMatch(/toolbar-btn/);
    });

    it("forwards ref to the button element", () => {
      const ref = { current: null as HTMLButtonElement | null };
      render(<IconButton icon={<StarIcon />} aria-label="Favourite" ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe("type-level aria-label enforcement", () => {
    it("requires aria-label — omitting it is a compile error (icon-only must be labelled)", () => {
      // @ts-expect-error - aria-label is a required prop; omitting it on an
      // icon-only button must fail to type-check. If IconButton ever makes
      // aria-label optional, this directive becomes unused and tsc fails.
      const missingLabel = <IconButton icon={<StarIcon />} />;
      // A correctly-labelled instance type-checks without complaint.
      const labelled = <IconButton icon={<StarIcon />} aria-label="Favourite" />;
      void missingLabel;
      void labelled;
      expect(true).toBe(true);
    });
  });
});
