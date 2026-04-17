import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageUpload } from "./ImageUpload";

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe("ImageUpload", () => {
  describe("empty state", () => {
    it("renders with label and hint", () => {
      render(<ImageUpload label="Logo" hint="PNG, SVG, or JPG" />);
      expect(screen.getByText("Logo")).toBeInTheDocument();
      expect(screen.getByText("PNG, SVG, or JPG")).toBeInTheDocument();
    });

    it("renders the add icon and prompt", () => {
      render(<ImageUpload />);
      expect(screen.getByText("Add image")).toBeInTheDocument();
    });
  });

  describe("file selection via click", () => {
    it("opens file picker on click", async () => {
      const user = userEvent.setup();
      render(<ImageUpload />);
      const tile = screen.getByRole("button");
      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      const clickSpy = vi.spyOn(input, "click");

      await user.click(tile);
      expect(clickSpy).toHaveBeenCalled();
    });

    it("opens file picker on Enter key", async () => {
      const user = userEvent.setup();
      render(<ImageUpload />);
      const tile = screen.getByRole("button");
      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      const clickSpy = vi.spyOn(input, "click");

      tile.focus();
      await user.keyboard("{Enter}");
      expect(clickSpy).toHaveBeenCalled();
    });

    it("opens file picker on Space key", async () => {
      const user = userEvent.setup();
      render(<ImageUpload />);
      const tile = screen.getByRole("button");
      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      const clickSpy = vi.spyOn(input, "click");

      tile.focus();
      await user.keyboard(" ");
      expect(clickSpy).toHaveBeenCalled();
    });

    it("calls onChange with selected file", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ImageUpload onChange={onChange} />);
      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      const file = createFile("logo.png", 1024, "image/png");

      await user.upload(input, file);
      expect(onChange).toHaveBeenCalledWith(file);
    });
  });

  describe("validation", () => {
    it("rejects files exceeding maxSize", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onError = vi.fn();
      render(
        <ImageUpload
          onChange={onChange}
          onValidationError={onError}
          maxSize={1024}
        />
      );
      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      const bigFile = createFile("huge.png", 2048, "image/png");

      await user.upload(input, bigFile);
      expect(onChange).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^File exceeds maximum size/));
    });

    it("rejects files not matching accept types via drag-and-drop", () => {
      const onChange = vi.fn();
      const onError = vi.fn();
      render(
        <ImageUpload
          onChange={onChange}
          onValidationError={onError}
          accept="image/png,image/jpeg"
        />
      );
      const tile = screen.getByRole("button");
      const pdfFile = createFile("doc.pdf", 512, "application/pdf");

      fireEvent.drop(tile, {
        dataTransfer: { files: [pdfFile] },
      });
      expect(onChange).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^File type not accepted/));
    });
  });

  describe("preview state", () => {
    it("shows preview image when value is set", () => {
      render(<ImageUpload value="https://example.com/logo.png" />);
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "https://example.com/logo.png");
    });

    it("shows replace button when value is set", () => {
      render(<ImageUpload value="https://example.com/logo.png" />);
      expect(screen.getByText("Replace")).toBeInTheDocument();
    });

    it("clears value and opens picker on replace click", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ImageUpload value="https://example.com/logo.png" onChange={onChange} />);

      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      const clickSpy = vi.spyOn(input, "click");

      await user.click(screen.getByText("Replace"));
      expect(onChange).toHaveBeenCalledWith(null);
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe("uploading state", () => {
    it("shows progress bar when progress is provided", () => {
      render(<ImageUpload value="blob:logo" progress={65} />);
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "65");
    });
  });

  describe("done state", () => {
    it("shows checkmark when done is true", () => {
      render(<ImageUpload value="https://example.com/logo.png" done />);
      expect(screen.getByLabelText("Upload complete")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message", () => {
      render(<ImageUpload error="Upload failed" />);
      expect(screen.getByText("Upload failed")).toBeInTheDocument();
    });

    it("sets aria-describedby when error is present", () => {
      render(<ImageUpload error="Upload failed" />);
      const tile = screen.getByRole("button");
      expect(tile).toHaveAttribute("aria-describedby");
    });
  });

  describe("disabled state", () => {
    it("prevents interaction when disabled", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ImageUpload disabled onChange={onChange} />);
      const tile = screen.getByRole("button");

      expect(tile).toHaveAttribute("aria-disabled", "true");
      await user.click(tile);

      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });
  });

  describe("accessibility", () => {
    it("has role button on the tile", () => {
      render(<ImageUpload />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("is keyboard focusable", () => {
      render(<ImageUpload />);
      const tile = screen.getByRole("button");
      expect(tile).toHaveAttribute("tabIndex", "0");
    });

    it("passes accept to hidden file input", () => {
      render(<ImageUpload accept="image/png,image/svg+xml" />);
      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      expect(input).toHaveAttribute("accept", "image/png,image/svg+xml");
    });
  });
});
