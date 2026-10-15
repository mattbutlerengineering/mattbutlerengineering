import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useAuth } from "@mbe/auth/react";
import { localeRuntime } from "./runtime.js";
import esMX from "./catalogs/es-MX.json";
import { LoginGate } from "../components/LoginGate.js";
import { CallbackPage } from "../components/CallbackPage.js";
import { SessionExpiredGate } from "../components/SessionExpiredGate.js";
import { AuthConfigError } from "../components/AuthConfigError.js";
import { DashboardSidebar } from "../components/DashboardSidebar.js";
import { AuthFailurePage } from "../pages/AuthFailurePage.js";
import { SignOutPage } from "../pages/SignOutPage.js";
import { LoadingPage } from "../pages/LoadingPage.js";
import { buildNavSections } from "../nav-sections.js";
import { describeAuthError } from "../lib/describe-auth-error.js";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));

beforeAll(async () => {
  vi.mocked(useAuth).mockReturnValue({
    signIn: vi.fn(),
    activeNavigator: undefined,
  } as unknown as ReturnType<typeof useAuth>);
  localeRuntime.i18n.addResourceBundle("es-MX", "translation", esMX, true, true);
  await localeRuntime.i18n.changeLanguage("es-MX");
});

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("shell and pre-auth screens in es-MX", () => {
  it("translates the login gate", () => {
    render(<LoginGate />);
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByText("Gestión de restaurantes, simplificada.")).toBeInTheDocument();
  });

  it("translates the callback, sign-out and loading screens", () => {
    render(
      <>
        <CallbackPage />
        <SignOutPage />
        <LoadingPage />
      </>
    );
    expect(screen.getByText("Intercambiando tu código por una sesión")).toBeInTheDocument();
    expect(screen.getByText("Cerrando tu sesión")).toBeInTheDocument();
    expect(screen.getByText("Poniendo la mesa")).toBeInTheDocument();
  });

  it("translates the session-expired gate", () => {
    render(<SessionExpiredGate />);
    expect(screen.getByText("Tu sesión terminó")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a iniciar sesión" })).toBeInTheDocument();
  });

  it("translates auth failures", () => {
    const error = Object.assign(new Error("x"), { error: "access_denied" });
    expect(describeAuthError(error).title).toBe("Acceso denegado");
    render(<AuthFailurePage error={new Error("Failed to fetch")} lane={0} />);
    expect(screen.getByText("Detalles técnicos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Intentar de nuevo" })).toBeInTheDocument();
  });

  it("translates the configuration error", () => {
    render(<AuthConfigError missing={["A"]} />);
    expect(screen.getByText("Error de configuración")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver al inicio" })).toBeInTheDocument();
  });

  it("translates sidebar sections, items and landmark", () => {
    const readiness = {
      status: "operational",
      completedSteps: [],
      nextStep: null,
    } as unknown as Parameters<typeof buildNavSections>[0];
    render(
      <MemoryRouter>
        <DashboardSidebar
          sections={buildNavSections(readiness, false)}
          activePath="/timeline"
          onAction={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("navigation", { name: "Navegación del panel" })).toBeInTheDocument();
    expect(screen.getByText("Lista de espera")).toBeInTheDocument();
    expect(screen.getByText("Cuenta")).toBeInTheDocument();
  });
});
