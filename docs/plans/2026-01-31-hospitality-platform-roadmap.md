# Hospitality Platform Roadmap

**Created:** 2026-01-31
**Status:** Active
**Reference:** Software Architecture and Data Modeling.pdf

## Overview

Phased roadmap to evolve the reservations service into a full hospitality management platform.

### Design Principles
- Start lean (Postgres-only), add infrastructure when scale demands
- Pay-as-you-grow: no Redis/advanced infra until needed
- PWA shell early, offline sync gradually
- Target: Small multi-venue (10-50) with room to scale

### Infrastructure Tiers

| Scale | Infrastructure | Monthly Cost |
|-------|---------------|--------------|
| **Tier 1** (1-10 venues) | Single Postgres, no Redis | ~$12-24 |
| **Tier 2** (10-50 venues) | Postgres + Redis cache | ~$30-50 |
| **Tier 3** (50+ venues) | Add RLS, partitioning, Redis inventory | ~$75+ |

---

## Progress Tracker

### Phase 0: Foundation
- [x] Add venueId to Table model
- [x] Add venueId to Reservation model
- [x] Create database migration
- [x] Update shared types
- [x] Update API routes

### Phase 1: Full Venue Model (1-2 weeks)
- [x] Create VenueGroup model
- [x] Create Venue model with timezone, currency, settings
- [x] Create venues service
- [x] Create venues routes (CRUD)
- [ ] Update tables to require venueId (deferred - keeping optional for backward compatibility)
- [ ] Update reservations to require venueId (deferred - keeping optional for backward compatibility)
- [x] Add venue slug for public booking URLs
- [x] Write tests
- [ ] Create venue onboarding flow

### Phase 2: Guest CRM (1-2 weeks)
- [x] Create Guest model
- [x] Identity resolution (match by email/phone)
- [x] Guest service with visit tracking
- [x] Guest routes (CRUD, search)
- [x] Link reservations to guests
- [x] Add tags/notes functionality
- [x] Basic segments (hasn't visited in X days)
- [x] Write tests

### Phase 3: Floor Plans & Canvas Editor (3-4 weeks)
- [x] Create FloorPlan model
- [x] Enhance Table model (min/max covers, coordinates, shapeMetadata)
- [x] Create FloorPlan service (CRUD, activate, bulk position updates)
- [x] Create FloorPlan routes and OpenAPI schemas
- [x] Write tests (20 new tests, 81 total)
- [ ] Set up Konva.js + react-konva (frontend)
- [ ] Canvas editor component (frontend)
- [ ] Drag-and-drop table placement (frontend)
- [ ] Table status colors (frontend)
- [ ] Timeline/Gantt view (frontend)
- [ ] WebSocket for real-time sync

### PWA Track (Parallel)
**Phase A - Basic PWA (with Phase 1-2)**
- [ ] PWA manifest
- [ ] Service Worker for static assets
- [ ] Basic offline shell

**Phase B - Read Cache (with Phase 3)**
- [ ] IndexedDB setup
- [ ] Cache today's reservations
- [ ] Cache floor plan

**Phase C - Offline Writes (Phase 4+)**
- [ ] Delta-sync protocol
- [ ] Offline mutation queue
- [ ] Conflict resolution (LWW)

### Phase 4: Availability & Booking Engine (2-3 weeks)
- [x] Time slot generation
- [x] Pacing limits
- [x] Table-party matching algorithm (best-fit: priority DESC, capacity ASC)
- [x] Duration estimation (by party size)
- [x] Hold mechanism (10-min checkout with opportunistic cleanup)
- [x] Conflict detection (prevents double-booking)
- [x] Availability routes (GET /:venueId, GET /:venueId/dates)
- [x] Hold routes (POST, GET, DELETE, confirm)
- [x] Write tests (106 total)
- [ ] Embeddable booking widget (frontend)
- [ ] Stripe integration for no-show fees

### Phase 5+: Future (As Needed)
- [ ] Event sourcing (reservation_events)
- [ ] RevPASH analytics
- [ ] POS integration (Toast, Square)
- [ ] Channel managers (OpenTable, Google)
- [ ] Redis inventory locking
- [ ] Row-Level Security

---

## Data Models

### Phase 1: Venue

```prisma
model VenueGroup {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  settings  Json?
  venues    Venue[]
  createdAt DateTime @default(now())
}

model Venue {
  id             String       @id @default(cuid())
  venueGroupId   String?      @map("venue_group_id")
  venueGroup     VenueGroup?  @relation(...)
  name           String
  slug           String       @unique
  ianaTimezone   String       @map("iana_timezone")
  currencyCode   String       @default("USD")
  operatingHours Json?
  settings       Json?
  tables         Table[]
  reservations   Reservation[]
  guests         Guest[]
  floorPlans     FloorPlan[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}
```

### Phase 2: Guest

```prisma
model Guest {
  id            String        @id @default(cuid())
  venueId       String
  venue         Venue         @relation(...)
  email         String?
  phone         String?
  name          String
  notes         String?
  visitCount    Int           @default(0)
  lifetimeSpend Decimal?
  lastVisit     DateTime?
  tags          Json?
  reservations  Reservation[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@unique([venueId, email])
  @@unique([venueId, phone])
}
```

### Phase 3: Floor Plan

```prisma
model FloorPlan {
  id         String   @id @default(cuid())
  venueId    String
  venue      Venue    @relation(...)
  name       String
  isActive   Boolean  @default(false)
  layoutJson Json
  tables     Table[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

// Enhanced Table
model Table {
  // existing...
  floorPlanId   String?
  floorPlan     FloorPlan? @relation(...)
  tableNumber   String
  minCovers     Int        @default(1)
  maxCovers     Int
  priority      Int        @default(0)
  shapeMetadata Json?
}
```

### Phase 4: Reservation Hold

```prisma
model ReservationHold {
  id        String   @id @default(cuid())
  venueId   String
  venue     Venue    @relation(...)
  tableId   String
  table     Table    @relation(...)
  date      DateTime @db.Date
  startTime DateTime
  endTime   DateTime
  partySize Int
  sessionId String
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([venueId, date])
  @@index([tableId, date])
  @@index([expiresAt])
  @@index([sessionId])
}
```

**VenueSettings additions:**
```typescript
interface VenueSettings {
  slotIntervalMinutes?: number;      // default 15
  lastSeatingBuffer?: number;        // minutes before close, default 90
  holdDurationMinutes?: number;      // default 10
  pacingRules?: PacingRule[];
  durationRules?: DurationRule[];
}
```

---

## When to Add Redis

Add Redis when you observe:
- Booking timeouts during peak times
- 50+ concurrent booking attempts for same slot
- "Kitchen crashing" complaints

Refactoring cost: ~1-2 days

---

## Timeline

| Phase | Feature | Effort | Target |
|-------|---------|--------|--------|
| 0 | venueId prep | - | ✅ Done |
| 1 | Venues | 1-2 weeks | ✅ Done |
| 2 | Guest CRM | 1-2 weeks | ✅ Done |
| 3 | Floor Plans | 3-4 weeks | ✅ Backend Done |
| PWA | Parallel | Incremental | TBD |
| 4 | Availability | 2-3 weeks | ✅ Backend Done |

**Total MVP:** ~8-11 weeks
