# @mbe/observability

Shared observability and telemetry library for the mattbutlerengineering ecosystem. Provides a unified interface for tracing, metrics, and structured logging.

## Installation

```json
{
  "dependencies": {
    "@mbe/observability": "workspace:*"
  }
}
```

## Tech Stack

- OpenTelemetry (SDK, HTTP/OTLP Exporters)
- Fastify (Middleware)
- Pino (Logging)
- UUID

## Key Features

- **Tracing**: Automated HTTP and Fastify request tracing with filtered health paths.
- **Request IDs**: Unified request ID generation and propagation across services.
- **Baggage**: Propagation of agent and deployment metadata across service boundaries.
- **Structured Logging**: Automatic injection of request and trace IDs into service logs.

## Usage

```typescript
import { initTelemetry } from "@mbe/observability";

// Initialize as early as possible
const sdk = initTelemetry({ serviceName: "my-service" });
sdk.start();
```

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
