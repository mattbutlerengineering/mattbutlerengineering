import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileUpload } from "./FileUpload";

function createFile(name: string, size: number, type: string): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

const pdf = () => createFile("menu.pdf", 2048, "application/pdf");
const png = () => createFile("photo.png", 100, "image/png");

/** File names passed to the nth `onFilesChange` call. */
function names(fn: ReturnType<typeof vi.fn>, call = 0): string[] {
  const files = (fn.mock.calls[call]?.[0] ?? []) as File[];
  return files.map((f) => f.name);
}

// applyAccept:false so the "wrong" file reaches the component's own validation
// (a real browser's picker filters, but drag-and-drop does not).
const setup = () => userEvent.setup({ applyAccept: false });

describe("FileUpload", () => {
  it("keeps only files matching accept and renders a rejection for the rest", async () => {
    const user = setup();
    const onFilesChange = vi.fn();
    render(<FileUpload label="Menus" accept=".pdf" multiple onFilesChange={onFilesChange} />);
    await user.upload(screen.getByLabelText("Menus"), [pdf(), png()]);
    expect(onFilesChange).toHaveBeenCalledTimes(1);
    expect(names(onFilesChange, 0)).toEqual(["menu.pdf"]);
    expect(screen.getByText(/photo\.png/)).toHaveTextContent("File type not accepted");
  });

  it("matches MIME types and wildcards in accept", async () => {
    const user = setup();
    const onFilesChange = vi.fn();
    render(<FileUpload label="Files" accept="image/*" multiple onFilesChange={onFilesChange} />);
    await user.upload(screen.getByLabelText("Files"), [pdf(), png()]);
    expect(names(onFilesChange, 0)).toEqual(["photo.png"]);
  });

  it("rejects files over maxSize and keeps the valid ones", async () => {
    const user = setup();
    const onFilesChange = vi.fn();
    render(<FileUpload label="Files" maxSize={1024} multiple onFilesChange={onFilesChange} />);
    await user.upload(screen.getByLabelText("Files"), [pdf(), png()]);
    expect(names(onFilesChange, 0)).toEqual(["photo.png"]);
    expect(screen.getByText(/menu\.pdf/)).toHaveTextContent("File exceeds maximum size");
  });

  it("rejects files beyond maxFiles", async () => {
    const user = setup();
    const onFilesChange = vi.fn();
    render(<FileUpload label="Files" multiple maxFiles={1} onFilesChange={onFilesChange} />);
    await user.upload(screen.getByLabelText("Files"), [pdf(), png()]);
    expect(names(onFilesChange, 0)).toEqual(["menu.pdf"]);
    expect(screen.getByText(/photo\.png/)).toHaveTextContent("Only 1 file");
  });

  it("appends in multiple mode and replaces without it", async () => {
    const user = setup();
    const multi = vi.fn();
    const { unmount } = render(<FileUpload label="Files" multiple onFilesChange={multi} />);
    await user.upload(screen.getByLabelText("Files"), pdf());
    await user.upload(screen.getByLabelText("Files"), png());
    expect(names(multi, 1)).toEqual(["menu.pdf", "photo.png"]);
    unmount();

    const single = vi.fn();
    render(<FileUpload label="Files" onFilesChange={single} />);
    await user.upload(screen.getByLabelText("Files"), pdf());
    await user.upload(screen.getByLabelText("Files"), png());
    expect(names(single, 1)).toEqual(["photo.png"]);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("opens the native picker from a real button and the zone is not a second tab stop", async () => {
    const user = setup();
    render(<FileUpload label="Files" />);
    const input = screen.getByLabelText("Files");
    const click = vi.spyOn(input, "click");
    const button = screen.getByRole("button", { name: "Choose files" });
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(click).toHaveBeenCalledTimes(2);
    expect(input).toHaveAttribute("tabindex", "-1");
    await user.tab();
    expect(button).not.toHaveFocus();
  });

  it("sets data-dragging while dragging and adds dropped files", () => {
    const onFilesChange = vi.fn();
    render(<FileUpload label="Files" multiple onFilesChange={onFilesChange} data-testid="zone" />);
    const zone = screen.getByTestId("zone");
    fireEvent.dragOver(zone, { dataTransfer: { files: [pdf()] } });
    expect(zone).toHaveAttribute("data-dragging", "true");
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveAttribute("data-dragging");
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } });
    expect(names(onFilesChange, 0)).toEqual(["menu.pdf"]);
  });

  it("ignores drag and drop when disabled", () => {
    const onFilesChange = vi.fn();
    render(<FileUpload label="Files" disabled onFilesChange={onFilesChange} data-testid="zone" />);
    const zone = screen.getByTestId("zone");
    fireEvent.dragOver(zone, { dataTransfer: { files: [pdf()] } });
    expect(zone).not.toHaveAttribute("data-dragging");
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } });
    expect(onFilesChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();
  });

  it("lists name and human-readable size, and removal returns focus to the browse button", async () => {
    const user = setup();
    const onFilesChange = vi.fn();
    render(<FileUpload label="Files" defaultValue={[pdf()]} onFilesChange={onFilesChange} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("menu.pdf");
    expect(item).toHaveTextContent("2.0KB");
    await user.click(screen.getByRole("button", { name: "Remove menu.pdf" }));
    expect(onFilesChange).toHaveBeenCalledWith([]);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toHaveFocus();
  });

  it("is controlled by value", () => {
    const { rerender } = render(<FileUpload label="Files" value={[pdf()]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    rerender(<FileUpload label="Files" value={[]} />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("announces additions, rejections and removals in a polite live region", async () => {
    const user = setup();
    render(<FileUpload label="Files" accept=".pdf" multiple />);
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    await user.upload(screen.getByLabelText("Files"), [pdf(), png()]);
    expect(live).toHaveTextContent("1 file added");
    expect(live).toHaveTextContent("1 file rejected");
    await user.click(screen.getByRole("button", { name: "Remove menu.pdf" }));
    expect(live).toHaveTextContent("menu.pdf removed");
  });

  it("marks the input invalid and links the error and hint", () => {
    render(<FileUpload label="Files" error="Add at least one menu" hint="PDF only" />);
    const input = screen.getByLabelText("Files");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const ids = input.getAttribute("aria-describedby")!.split(" ");
    const text = ids.map((id) => document.getElementById(id)?.textContent);
    expect(text).toContain("Add at least one menu");
    expect(text).toContain("PDF only");
  });

  it("forwards its ref to the root element", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<FileUpload label="Files" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
