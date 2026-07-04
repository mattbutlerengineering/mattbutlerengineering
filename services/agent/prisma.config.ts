// Thin re-export — shared logic lives in packages/database/src/prisma-config.ts.
// Import via a RELATIVE path (not the "@mbe/database" package specifier): the DB-migrate
// Docker image (infrastructure/migrate/Dockerfile) copies raw source files without running
// `pnpm install`, so a bare workspace-package specifier would not resolve there.
import { createPrismaConfig } from "../../packages/database/src/prisma-config.js";

export default createPrismaConfig();
