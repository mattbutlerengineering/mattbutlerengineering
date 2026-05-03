# API Versioning Strategy

This document describes the API versioning strategy for all services in the monorepo.

## Overview

All services use HTTP header-based API versioning. When a new API version is released, the old version receives deprecation headers that inform clients of the upcoming sunset date.

## Headers

All API responses include the following headers:

| Header        | Description                             | Example                                    |
| ------------- | --------------------------------------- | ------------------------------------------ |
| `API-Version` | Current API version                     | `v1`, `v2`                                 |
| `Link`        | Successor version URL (when applicable) | `</api/v2/users>; rel="successor-version"` |

### Deprecation Headers

When an API version is deprecated, responses include:

| Header        | Description                                    | Example                                    |
| ------------- | ---------------------------------------------- | ------------------------------------------ |
| `Deprecation` | Indicates deprecated version                   | `true`                                     |
| `Sunset`      | RFC 7231 date when version will be unavailable | `Sat, 01 Jan 2027 00:00:00 GMT`            |
| `Link`        | Successor version URL                          | `</api/v2/users>; rel="successor-version"` |

## Version Lifecycle

1. **Current**: Version is actively maintained and supported
2. **Deprecated**: Version is superseded but still available. Clients receive deprecation headers.
3. **Sunset**: Version is no longer available after the sunset date

## Sunset Policy

- Sunset date is set to **6 months** after a new version ships
- No new features are added to deprecated versions
- Critical security patches may be applied during the deprecation period

## Example Response (Current Version)

```
HTTP/1.1 200 OK
API-Version: v1
Content-Type: application/json

{"data": {...}}
```

## Example Response (Deprecated Version)

```
HTTP/1.1 200 OK
API-Version: v1
Deprecation: true
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Link: </api/v2/users>; rel="successor-version"
Content-Type: application/json

{"data": {...}}
```

## Health Check Response

Health check endpoints include version information:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "apiVersion": "v1",
  "successorVersion": "v2",
  "sunsetDate": "Sat, 01 Jan 2027 00:00:00 GMT",
  "timestamp": "2026-04-04T00:00:00.000Z",
  "checks": {...}
}
```

## Client Recommendations

1. **Read version headers** from all API responses
2. **Monitor deprecation headers** and plan migration to new versions
3. **Migrate before sunset date** to avoid service disruption
4. **Subscribe to release notes** for advance notice of deprecations

## Version Paths

Services use path-based versioning:

- Users Service: `/api/v1/users/*`
- Reservations Service: `/api/v1/*`
- Agent Service: `/v1/*`

## Migration Guide

To migrate from v1 to v2:

1. Update your client to use v2 endpoints
2. Test your integration with v2
3. Remove v1 endpoint usage
4. Update any breaking changes in your code

For breaking changes between versions, see the changelog.
