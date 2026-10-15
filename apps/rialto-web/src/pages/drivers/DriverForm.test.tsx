import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { DriverProvider } from "./DriverProvider";
import { DriverCreate } from "./DriverCreate";
import { DriverUpdate } from "./DriverUpdate";
import { useDrivers } from "./DriverContext";
import type * as rialto from "@mattbutlerengineering/rialto";

const toastSpy = vi.hoisted(() => vi.fn());

vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof rialto>()),
  useToast: () => ({ toast: toastSpy }),
}));

/** Shows what the demo data model actually holds for driver 1 after saving. */
function SavedProbe() {
  const { getDriver } = useDrivers();
  const d = getDriver("1");
  return (
    <div data-testid="saved">
      {d?.bio ?? "no-bio"}|{d?.dob ?? "no-dob"}
    </div>
  );
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={["/new"]}>
      <Routes>
        <Route element={<DriverProvider />}>
          <Route path="/new" element={<DriverCreate />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function renderUpdate() {
  return render(
    <MemoryRouter initialEntries={["/drivers/1/edit"]}>
      <Routes>
        <Route element={<DriverProvider />}>
          <Route path="/drivers/:id/edit" element={<DriverUpdate />} />
          <Route path="/demos/drivers/:id" element={<SavedProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  toastSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DriverForm — create", () => {
  it("starts with an empty car number and no errors showing", () => {
    renderCreate();
    expect(screen.queryByText("Must be between 1 and 99.")).not.toBeInTheDocument();
    expect(screen.queryByText("Team is required.")).not.toBeInTheDocument();
  });

  it("renders the car number and team errors when submitting an empty form", () => {
    renderCreate();
    fireEvent.click(screen.getByRole("button", { name: "Add Driver" }));

    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Must be between 1 and 99.")).toBeInTheDocument();
    expect(screen.getByText("Team is required.")).toBeInTheDocument();
    expect(screen.getByText("Nationality is required.")).toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

describe("DriverForm — update", () => {
  it("renders the team error when the team is cleared and saved", () => {
    renderUpdate();
    fireEvent.change(screen.getByLabelText(/^Team/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(screen.getByText("Team is required.")).toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("persists the bio and date of birth it collects", async () => {
    renderUpdate();
    fireEvent.click(screen.getByText("Additional Details"));
    fireEvent.change(screen.getByLabelText("Date of Birth"), { target: { value: "1997-10-16" } });
    fireEvent.change(screen.getByLabelText(/^Bio/), { target: { value: "Monaco native." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByTestId("saved")).toHaveTextContent("Monaco native.|1997-10-16");
  });
});
