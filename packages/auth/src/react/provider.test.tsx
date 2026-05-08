// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

// Capture OIDCProvider props for inspection
const mockOIDCProvider = vi.fn(
  ({ children }: { children: React.ReactNode }) => <div>{children}</div>
);

vi.mock("react-oidc-context", () => ({
  AuthProvider: (props: Record<string, unknown>) => mockOIDCProvider(props),
}));

import { AuthProvider } from "./provider.js";
import type { OIDCConfig } from "../types/index.js";

const baseConfig: OIDCConfig = {
  authority: "https://test.auth0.com",
  clientId: "client-abc",
  redirectUri: "https://app.example.com/callback",
};

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children inside the OIDC provider", () => {
    render(
      <AuthProvider config={baseConfig}>
        <div>child content</div>
      </AuthProvider>
    );

    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("passes authority, client_id, and redirect_uri to OIDCProvider", () => {
    render(<AuthProvider config={baseConfig}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props.authority).toBe("https://test.auth0.com");
    expect(props.client_id).toBe("client-abc");
    expect(props.redirect_uri).toBe("https://app.example.com/callback");
  });

  it("uses redirectUri as post_logout_redirect_uri when postLogoutRedirectUri is not provided", () => {
    render(<AuthProvider config={baseConfig}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props.post_logout_redirect_uri).toBe("https://app.example.com/callback");
  });

  it("uses postLogoutRedirectUri when provided", () => {
    const config: OIDCConfig = {
      ...baseConfig,
      postLogoutRedirectUri: "https://app.example.com/logout",
    };

    render(<AuthProvider config={config}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props.post_logout_redirect_uri).toBe("https://app.example.com/logout");
  });

  it("defaults scope to 'openid profile email' when not provided", () => {
    render(<AuthProvider config={baseConfig}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props.scope).toBe("openid profile email");
  });

  it("uses custom scope when provided", () => {
    const config: OIDCConfig = { ...baseConfig, scope: "openid email" };

    render(<AuthProvider config={config}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props.scope).toBe("openid email");
  });

  it("passes audience in extraQueryParams when audience is provided", () => {
    const config: OIDCConfig = {
      ...baseConfig,
      audience: "https://api.example.com",
    };

    render(<AuthProvider config={config}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props.extraQueryParams).toEqual({ audience: "https://api.example.com" });
  });

  it("does not pass extraQueryParams when audience is not provided", () => {
    render(<AuthProvider config={baseConfig}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props.extraQueryParams).toBeUndefined();
  });

  it("cleans up URL after sign-in callback", () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    render(<AuthProvider config={baseConfig}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    const onSigninCallback = props.onSigninCallback as () => void;

    // Invoke the callback as OIDC library would
    onSigninCallback();

    expect(replaceStateSpy).toHaveBeenCalledWith(
      {},
      document.title,
      window.location.pathname
    );
  });

  it("calls onSigninCallback prop after sign-in", () => {
    const onSigninCallback = vi.fn();

    render(
      <AuthProvider config={baseConfig} onSigninCallback={onSigninCallback}>
        <div />
      </AuthProvider>
    );

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    const oidcCallback = props.onSigninCallback as () => void;

    oidcCallback();

    expect(onSigninCallback).toHaveBeenCalledOnce();
  });

  it("does not throw when onSigninCallback prop is not provided", () => {
    render(<AuthProvider config={baseConfig}><div /></AuthProvider>);

    const props = mockOIDCProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    const oidcCallback = props.onSigninCallback as () => void;

    expect(() => oidcCallback()).not.toThrow();
  });
});
