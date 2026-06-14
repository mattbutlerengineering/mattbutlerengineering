import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({
    children,
    as: As = "span",
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    variant?: string;
    color?: string;
    className?: string;
  }) => <As>{children}</As>,
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
  }) => <button onClick={onClick}>{children}</button>,
  Card: ({ children }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <div data-testid="card">{children}</div>
  ),
  Badge: ({ children }: { children: React.ReactNode; variant?: string; size?: string }) => (
    <span data-testid="badge">{children}</span>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="skeleton-group">{children}</div>
  ),
  EmptyState: ({
    heading,
    description,
  }: {
    heading: string;
    description: string;
    variant?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <div>{heading}</div>
      <div>{description}</div>
    </div>
  ),
  ThemeToggle: ({ onToggle }: { onToggle: () => void; theme: string }) => (
    <button onClick={onToggle} data-testid="theme-toggle">
      Theme
    </button>
  ),
  Divider: () => <hr />,
}));

vi.mock("@json-render/react", () => ({
  JSONUIProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Renderer: () => <div data-testid="renderer" />,
}));

vi.mock("@mbe/rialto-catalog", () => ({
  registry: {},
}));

vi.mock("../contexts/ThemeContext.js", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

// Mock @mbe/api-client — ApiClient must be a class (constructable) in the mock
const mockRequest = vi.fn();

vi.mock("@mbe/api-client", () => {
  class MockApiClient {
    request = mockRequest;
    get = mockRequest;
  }
  class MockApiClientError extends Error {
    statusCode: number;
    category: string;
    constructor(statusCode: number, message: string) {
      super(message);
      this.name = "ApiClientError";
      this.statusCode = statusCode;
      this.category = statusCode === 404 ? "notFound" : "serverError";
    }
  }
  return {
    ApiClient: MockApiClient,
    ApiClientError: MockApiClientError,
  };
});

// Import MockApiClientError for use in tests — must match the class used in the mock
class MockApiClientError extends Error {
  statusCode: number;
  category: string;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.category = statusCode === 404 ? "notFound" : "serverError";
  }
}

import { SharedSpecPage } from "./SharedSpecPage.js";

function renderWithRoute(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/gen/s/${id}`]}>
      <Routes>
        <Route path="/gen/s/:id" element={<SharedSpecPage />} />
        <Route path="/gen/" element={<div>Playground</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const MOCK_SPEC = {
  id: "abc-123",
  userId: "user-1",
  prompt: "Build a dashboard",
  spec: { type: "Stack", children: [] },
  rawLines: ["{}"],
  isFavorite: false,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
};

describe("SharedSpecPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("shows loading skeletons initially", () => {
    mockRequest.mockReturnValue(new Promise(() => {}));
    renderWithRoute("abc-123");
    expect(screen.getByTestId("skeleton-group")).toBeDefined();
  });

  it("uses @mbe/api-client (not raw fetch) to load the spec", async () => {
    mockRequest.mockResolvedValue({ data: MOCK_SPEC });
    renderWithRoute("abc-123");
    await waitFor(() => {
      expect(screen.getByText("Build a dashboard")).toBeDefined();
    });
    expect(mockRequest).toHaveBeenCalledWith(
      "/api/gen/specs/abc-123",
      expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) })
    );
  });

  it("shows spec after successful fetch via api-client", async () => {
    mockRequest.mockResolvedValue({ data: MOCK_SPEC });
    renderWithRoute("abc-123");
    await waitFor(() => {
      expect(screen.getByText("Build a dashboard")).toBeDefined();
    });
    expect(screen.getByTestId("renderer")).toBeDefined();
  });

  it("shows error state when spec not found (404) via api-client", async () => {
    mockRequest.mockRejectedValue(new MockApiClientError(404, "Not Found"));
    renderWithRoute("nonexistent");
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });
    expect(screen.getByText("Spec not found")).toBeDefined();
  });

  it("shows error state when fetch fails (network error)", async () => {
    mockRequest.mockRejectedValue(new Error("Network error"));
    renderWithRoute("abc-123");
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });
    expect(screen.getByText("Network error")).toBeDefined();
  });

  it("shows error when api-client throws non-404 error", async () => {
    mockRequest.mockRejectedValue(new MockApiClientError(500, "Internal Server Error"));
    renderWithRoute("abc-123");
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });
  });

  it("renders copy link button and copies to clipboard (success)", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } });

    mockRequest.mockResolvedValue({ data: MOCK_SPEC });
    renderWithRoute("abc-123");

    await waitFor(() => {
      expect(screen.getByText("Copy Link")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Copy Link"));
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
    });
  });

  it("shows clipboard failure feedback when copy returns false", async () => {
    const mockWriteText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } });
    vi.spyOn(window, "prompt").mockReturnValue(null);

    mockRequest.mockResolvedValue({ data: MOCK_SPEC });
    renderWithRoute("abc-123");

    await waitFor(() => {
      expect(screen.getByText("Copy Link")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Copy Link"));
    await waitFor(() => {
      expect(screen.getByText("Copy failed")).toBeDefined();
    });
    vi.restoreAllMocks();
  });

  it("renders theme toggle", async () => {
    mockRequest.mockResolvedValue({ data: MOCK_SPEC });
    renderWithRoute("abc-123");
    expect(screen.getByTestId("theme-toggle")).toBeDefined();
  });

  it("renders Generated with AI badge on success", async () => {
    mockRequest.mockResolvedValue({ data: MOCK_SPEC });
    renderWithRoute("abc-123");
    await waitFor(() => {
      expect(screen.getByTestId("badge")).toBeDefined();
    });
  });
});
