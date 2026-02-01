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
- [ ] Create Guest model
- [ ] Identity resolution (match by email/phone)
- [ ] Guest service with visit tracking
- [ ] Guest routes (CRUD, search)
- [ ] Link reservations to guests
- [ ] Add tags/notes functionality
- [ ] Basic segments (hasn't visited in X days)
- [ ] Write tests

### Phase 3: Floor Plans & Canvas Editor (3-4 weeks)
- [ ] Create FloorPlan model
- [ ] Enhance Table model (min/max covers, coordinates)
- [ ] Set up Konva.js + react-konva
- [ ] Canvas editor component
- [ ] Drag-and-drop table placement
- [ ] Table status colors
- [ ] Timeline/Gantt view
- [ ] WebSocket for real-time sync
- [ ] Write tests

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

### Phase 4: Availability & Booking Widget (2-3 weeks)
- [ ] Time slot generation
- [ ] Pacing limits
- [ ] Table-party matching algorithm
- [ ] Duration estimation
- [ ] Hold mechanism (10-min checkout)
- [ ] Embeddable booking widget
- [ ] Stripe integration for no-show fees
- [ ] Write tests

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
| 1 | Venues | 1-2 weeks | TBD |
| 2 | Guest CRM | 1-2 weeks | TBD |
| 3 | Floor Plans | 3-4 weeks | TBD |
| PWA | Parallel | Incremental | TBD |
| 4 | Availability | 2-3 weeks | TBD |

**Total MVP:** ~8-11 weeks
