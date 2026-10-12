import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

import { buildApp } from "./app.js";
import { db } from "./services/database.js";

describe("App factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("builds and starts the app", async () => {
    const app = await buildApp({ logger: false });
    expect(app).toBeDefined();
    await app.close();
  });

  it("shuts the database down when the app closes (#6373)", async () => {
    vi.mocked(db.shutdown).mockClear();
    const app = await buildApp({ logger: false });
    await app.ready();
    expect(db.shutdown).not.toHaveBeenCalled();

    await app.close();

    expect(db.shutdown).toHaveBeenCalledTimes(1);
  });
});
