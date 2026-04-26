# Dependency Graph

> **Auto-generated** — do not edit manually.
> Regenerate with `pnpm graph`.

Inter-workspace dependency relationships between `@mbe/*` packages.

```mermaid
flowchart TD
  subgraph apps["Frontend Apps"]
    gen["gen"]
    hospitality["hospitality"]
    marketing["marketing"]
    rialto_web["rialto-web"]
  end
  subgraph services["Backend Services"]
    agent_service["agent"]
    reservations_service["reservations"]
    users_service["users"]
  end
  subgraph packages["Shared Packages"]
    agent_core["agent-core"]
    api_client["api-client"]
    api_versioning["api-versioning"]
    auth["auth"]
    config["config"]
    observability["observability"]
    @mattbutlerengineering/rialto["rialto"]
    rialto_catalog["rialto-catalog"]
    rialto_plugin["rialto-plugin"]
    sentry["sentry"]
    types["types"]
  end
  subgraph tools["Developer Tools"]
    cli["cli"]
  end

  gen --> api_client
  gen --> auth
  gen --> rialto_catalog
  gen --> config
  hospitality --> api_client
  hospitality --> auth
  hospitality --> rialto_catalog
  hospitality --> sentry
  hospitality --> types
  hospitality --> config
  marketing --> sentry
  marketing --> config
  rialto_web --> sentry
  rialto_web --> config
  agent_service --> agent_core
  agent_service --> api_versioning
  agent_service --> auth
  agent_service --> observability
  agent_service --> rialto_catalog
  agent_service --> sentry
  agent_service --> types
  agent_service --> config
  reservations_service --> api_versioning
  reservations_service --> auth
  reservations_service --> observability
  reservations_service --> sentry
  reservations_service --> types
  reservations_service --> config
  users_service --> api_versioning
  users_service --> auth
  users_service --> observability
  users_service --> sentry
  users_service --> types
  users_service --> config
  agent_core --> types
  agent_core --> config
  api_client --> types
  api_client --> config
  api_versioning --> config
  auth --> types
  auth --> config
  observability --> types
  observability --> config
  @mattbutlerengineering/rialto --> api_client
  @mattbutlerengineering/rialto --> config
  rialto_catalog --> config
  rialto_plugin --> config
  sentry --> types
  sentry --> config
  types --> config
  cli --> agent_core
  cli --> types
  cli --> config

  classDef frontend fill:#e0f2fe,stroke:#0284c7
  classDef backend fill:#fef3c7,stroke:#d97706
  classDef shared fill:#e0e7ff,stroke:#4f46e5
  classDef tooling fill:#f0fdf4,stroke:#16a34a
  class gen frontend
  class hospitality frontend
  class marketing frontend
  class rialto_web frontend
  class agent_service backend
  class reservations_service backend
  class users_service backend
  class agent_core shared
  class api_client shared
  class api_versioning shared
  class auth shared
  class config shared
  class observability shared
  class @mattbutlerengineering/rialto shared
  class rialto_catalog shared
  class rialto_plugin shared
  class sentry shared
  class types shared
  class cli tooling
```

## Legend

| Color | Category |
|-------|----------|
| Blue | Frontend Apps (`apps/*`) |
| Amber | Backend Services (`services/*`) |
| Indigo | Shared Packages (`packages/*`) |
| Green | Developer Tools (`tools/*`) |
