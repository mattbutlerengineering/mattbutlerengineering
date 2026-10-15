import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownMenu } from "./DropdownMenu";
import { Button } from "../Button/Button";

describe("DropdownMenu ReactNode item labels", () => {
  it("renders a node label, keeping its lang attribute and an accessible name", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button>Language</Button>}
        items={[
          {
            id: "fr",
            label: <span lang="fr-CA">Français (Canada)</span>,
            onSelect,
          },
          { id: "en", label: "English" },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Language" }));
    const item = screen.getByRole("menuitem", { name: "Français (Canada)" });
    expect(item.querySelector("[lang='fr-CA']")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "English" })).toBeInTheDocument();
    await user.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
