import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "./Select";

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const options: SelectOption[] = Array.from({ length: 12 }, (_, i) => ({
  value: `o${i}`,
  label: `Option ${i}`,
}));

function rectAt(top: number, height = 40): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 100,
    right: 300,
    width: 200,
    height,
    x: 100,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

async function openAt(top: number) {
  const user = userEvent.setup();
  render(<Select aria-label="Time" options={options} />);
  const trigger = screen.getByRole("combobox");
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rectAt(top));
  await user.click(trigger);
  return { trigger, list: screen.getByRole("listbox") };
}

describe("Select viewport positioning", () => {
  const originalHeight = window.innerHeight;
  let scrollHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", { value: 720, configurable: true });
    scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 400,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerHeight", { value: originalHeight, configurable: true });
    if (scrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeight);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
    vi.restoreAllMocks();
  });

  it("opens downward when there is room below", async () => {
    const { list } = await openAt(100);
    expect(list.style.top).toBe("144px");
    expect(list.style.bottom).toBe("");
    expect(list.style.maxHeight).toBe("240px");
  });

  it("flips above the trigger when it is low and there is more room above", async () => {
    const { list } = await openAt(600);
    // anchored by its bottom edge, 4px above the trigger top (720 - 600 + 4)
    expect(list.style.bottom).toBe("124px");
    expect(list.style.top).toBe("");
    expect(list.style.maxHeight).toBe("240px");
  });

  it("shrinks to the space available when neither side fits the list", async () => {
    const { list } = await openAt(150);
    Object.defineProperty(window, "innerHeight", { value: 300, configurable: true });
    fireEvent(window, new Event("resize"));
    // below: 300 - 190 - 4 - 8 = 98; above: 150 - 4 - 8 = 138 -> flips, capped to 138
    expect(list.style.bottom).toBe("154px");
    expect(list.style.maxHeight).toBe("138px");
  });

  it("measures the list at the trigger's width, so wrapped labels count on first open", async () => {
    // Narrow lists wrap: 400px tall at the trigger's 200px width, one line tall before it.
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.style.width === "200px" ? 400 : 100;
      },
    });
    const { list } = await openAt(560);
    // below: 720 - 600 - 4 - 8 = 108, so a 100px list would stay put; a 240px one flips.
    expect(list.style.bottom).toBe("164px");
    expect(list.style.top).toBe("");
  });

  it("follows the trigger on scroll", async () => {
    const { trigger, list } = await openAt(100);
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rectAt(200));
    fireEvent.scroll(window);
    expect(list.style.top).toBe("244px");
  });
});
