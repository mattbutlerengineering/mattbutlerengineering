import Conf from "conf";

interface ConfigSchema {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
  apiUrl?: string;
}

export const config = new Conf<ConfigSchema>({
  projectName: "mbe-cli",
  schema: {
    accessToken: { type: "string" },
    refreshToken: { type: "string" },
    tokenExpiry: { type: "number" },
    apiUrl: { type: "string", default: "http://localhost:3001" },
  },
});

export function getApiUrl(): string {
  return config.get("apiUrl") ?? "http://localhost:3001";
}

export function getAccessToken(): string | undefined {
  const expiry = config.get("tokenExpiry");
  if (expiry && Date.now() > expiry) {
    // Token expired
    config.delete("accessToken");
    return undefined;
  }
  return config.get("accessToken");
}

export function setTokens(accessToken: string, expiresIn: number): void {
  config.set("accessToken", accessToken);
  config.set("tokenExpiry", Date.now() + expiresIn * 1000);
}

export function clearTokens(): void {
  config.delete("accessToken");
  config.delete("refreshToken");
  config.delete("tokenExpiry");
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
