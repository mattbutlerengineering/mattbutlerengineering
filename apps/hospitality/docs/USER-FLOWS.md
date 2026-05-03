# Hospitality App — User Flows

> Harness context for AI agents. Defines critical user flows with step-by-step paths,
> acceptance criteria, and "done" definitions. Use this to verify feature completeness
> and guide E2E test authoring.

---

## Personas

| Persona                | Role                               | Key Goals                                                     |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------- |
| **Restaurant Manager** | Owns venue(s), configures settings | Maximize covers, reduce no-shows, track guest lifetime value  |
| **Host / Hostess**     | Seats guests, manages walk-ins     | Fast table assignment, accurate wait times, guest recognition |
| **Admin**              | System operator                    | User management, system health, access control                |

---

## Flow 1: First-Time Venue Setup (Manager)

**Entry:** Manager signs up → lands on empty Dashboard

### Steps

1. Manager clicks "New Venue" in sidebar (or onboarding CTA if no venues exist)
2. **Step 1 — Basic Info:** enters venue name, slug auto-generates from name
3. **Step 2 — Location & Time:** selects timezone, currency
4. **Step 3 — Operating Hours:** toggles days on/off, sets open/close times
5. **Step 4 — Settings:** default reservation duration, max party size, advance booking days
6. **Step 5 — Review:** confirms all data → clicks "Create Venue"
7. Redirected to Floor Plan creation for the new venue
8. Creates floor plan → adds tables → activates the plan

### Acceptance Criteria

- [ ] Slug is URL-safe, auto-generated, editable
- [ ] Timezone dropdown is searchable (not just alphabetical scroll)
- [ ] Each step validates before allowing "Next"
- [ ] "Back" preserves form state (no data loss)
- [ ] On API error, shows retry with preserved form data
- [ ] After venue creation, floor plan editor opens with the new venue's ID
- [ ] Floor plan can be activated immediately

### Done Definition

Manager has a venue with at least one active floor plan containing tables. Timeline page shows the venue's tables.

---

## Flow 2: Daily Operations — Morning Setup (Host)

**Entry:** Host opens app at start of shift

### Steps

1. Dashboard loads → shows today's stats (reservation count, covers, upcoming 2h)
2. Host checks Timeline for today → sees reservation blocks by table
3. Reviews first reservation → confirms details are correct
4. Checks Floor Plan → verifies table arrangement matches physical setup
5. Marks any out-of-service tables as DIRTY or READY

### Acceptance Criteria

- [ ] Dashboard stats load within 2 seconds
- [ ] Timeline shows current time indicator (red line)
- [ ] SSE connection establishes and shows "Live" indicator
- [ ] Table status can be toggled: AVAILABLE → OCCUPIED → DIRTY → READY → AVAILABLE
- [ ] Floor plan reflects the same tables as Timeline

### Done Definition

Host sees accurate data for today, SSE is connected, tables match physical layout.

---

## Flow 3: Handling a Walk-In (Host)

**Entry:** Guest arrives without reservation

### Steps

1. Host opens Timeline → clicks "Walk-In" button
2. Walk-In dialog opens → enters party size, guest name (optional), table selection
3. Submits → reservation created with status CONFIRMED
4. Table status changes to OCCUPIED
5. Timeline updates in real-time (SSE broadcast)
6. Other connected clients see the update immediately

### Acceptance Criteria

- [ ] Walk-In dialog validates party size (1–max from venue settings)
- [ ] Table dropdown only shows AVAILABLE tables
- [ ] On submit, reservation appears immediately on Timeline (optimistic update)
- [ ] SSE broadcasts the new reservation to all connected clients
- [ ] If API call fails, shows error and does NOT mark table as occupied
- [ ] Guest name is optional (defaults to "Walk-in")

### Done Definition

Walk-in reservation visible on Timeline, table marked OCCUPIED, other clients notified.

---

## Flow 4: Managing a Reservation (Host / Manager)

**Entry:** Reservation exists on Timeline

### Steps

1. Click reservation block on Timeline → Detail sidebar opens
2. View guest name, party size, time, table, status, notes
3. **Edit:** Click "Edit" → EditReservationDrawer opens → modify fields → Save
4. **Seat:** Click "Mark as Seated" → status changes to CONFIRMED, table to OCCUPIED
5. **Cancel:** Click "Cancel" → CancelReservationDialog opens → select reason → confirm
6. **Complete:** After guest leaves, click "Complete" → status to COMPLETED, table to DIRTY

### Acceptance Criteria

- [ ] Detail sidebar shows all reservation fields
- [ ] Edit validates: party size > 0, end time > start time, table exists
- [ ] Cancel requires a reason (dropdown) and optional note
- [ ] Status transitions follow: PENDING → CONFIRMED → COMPLETED, or → CANCELLED
- [ ] Table status updates match reservation status changes
- [ ] All changes broadcast via SSE
- [ ] Sidebar closes after successful action
- [ ] On API error, revert optimistic update and show error message

### Done Definition

Reservation can be viewed, edited, seated, cancelled, and completed. All state changes are consistent.

---

## Flow 5: Guest Lookup & Recognition (Host)

**Entry:** Guest arrives, host wants to check history

### Steps

1. Navigate to Guests page (or use ⌘K → "Go to Guests")
2. Search by guest name or email
3. Click guest → Detail drawer shows visit history, tags, notes, lifetime value
4. Host greets guest by name, notes preferences (e.g., "prefers booth, allergic to shellfish")
5. If new guest, clicks "Add Guest" → enters name, email, phone, tags

### Acceptance Criteria

- [ ] Search returns results within 500ms
- [ ] Guest detail shows: name, email, phone, visit count, last visit, tags, notes
- [ ] Tags are visible and meaningful (VIP, Regular, etc.)
- [ ] Add Guest validates email format if provided
- [ ] Guest created via find-or-create (no duplicates)

### Done Definition

Host can find any guest by name/email, see their history, and create new guest records.

---

## Flow 6: Floor Plan Management (Manager)

**Entry:** Manager wants to rearrange tables

### Steps

1. Navigate to Floor Plans → click existing plan (or create new)
2. FloorPlanEditorPage loads with canvas and table list
3. Drag tables to new positions → snap to grid
4. Add new table → specify name, capacity, shape
5. Delete table (with confirmation)
6. Click "Save" → batch position update
7. Click "Activate" to make this the active floor plan

### Acceptance Criteria

- [ ] Canvas loads with correct table positions
- [ ] Drag-and-drop works with 20px grid snapping
- [ ] Tables cannot be dragged outside canvas bounds
- [ ] Add table validates: name required, capacity > 0
- [ ] Delete shows confirmation dialog
- [ ] "Unsaved changes" indicator appears after any modification
- [ ] Save batches all position updates in one API call
- [ ] Activate sets this plan as the venue's active plan
- [ ] Back button warns if unsaved changes exist

### Done Definition

Manager can rearrange tables, add/remove them, save changes, and activate the plan.

---

## Flow 7: Booking Widget Setup (Manager / Developer)

**Entry:** Manager wants to add online booking to their website

### Steps

1. Navigate to Booking Widget page
2. Select venue from dropdown
3. Preview widget in desktop/tablet/mobile frames
4. Copy embed code
5. Paste into external website
6. Test: guest visits website → selects date/party → picks time slot → fills details → confirms

### Acceptance Criteria

- [ ] Venue selector shows all venues
- [ ] Preview renders the actual BookingWidget component
- [ ] Device frame correctly constrains width (375px mobile, 768px tablet, full desktop)
- [ ] Embed code includes correct venue ID
- [ ] Copy button provides clipboard feedback
- [ ] Widget flow: date → time slot (with availability check) → guest details → hold → confirm
- [ ] Hold expires after 10 minutes with countdown timer
- [ ] Confirmation shows reservation number

### Done Definition

Manager can preview the widget, copy working embed code, and the widget correctly creates reservations.

---

## Flow 8: User Administration (Admin)

**Entry:** Admin needs to manage system users

### Steps

1. Navigate to Admin page
2. View user stats (total, verified, new this month)
3. Search for specific user by name or email
4. Filter by verification status (All / Verified / Unverified)
5. Click user row to expand details (ID, created date, theme preference)
6. Paginate through user list

### Acceptance Criteria

- [ ] Stats update when filters change
- [ ] Search is case-insensitive and matches partial strings
- [ ] Expanded row shows complete user metadata
- [ ] Pagination controls are accessible (keyboard navigable)
- [ ] Empty state shows helpful message when no users match filters

### Done Definition

Admin can find any user, view their details, and filter the list effectively.

---

## Flow 9: Settings & Preferences (Manager)

**Entry:** Manager wants to customize their experience

### Steps

1. Navigate to Settings
2. Change theme (light/dark/system) → UI updates immediately
3. Toggle email notifications → saved to API
4. Set venue defaults (duration, party size, auto-confirm) → saved to localStorage
5. Navigate to Profile → edit name/picture → save

### Acceptance Criteria

- [ ] Theme changes apply immediately (no page reload)
- [ ] Theme preference persists across sessions (API-backed)
- [ ] Notification toggles save with success feedback
- [ ] Venue defaults persist across page reloads (localStorage)
- [ ] Profile name change reflects in avatar/greeting immediately
- [ ] Profile save shows success message (3-second auto-dismiss)

### Done Definition

Manager's preferences persist and are reflected across the app.

---

## Flow 10: Real-Time Collaboration (Multiple Users)

**Entry:** Two hosts are managing the same venue simultaneously

### Steps

1. Host A opens Timeline for Venue X
2. Host B opens Timeline for Venue X on a different device
3. Host A creates a walk-in → reservation appears on Host B's timeline
4. Host B seats a guest → table status updates on Host A's screen
5. Host A cancels a reservation → Host B sees it disappear from confirmed list

### Acceptance Criteria

- [ ] SSE connection is established per-venue
- [ ] Events broadcast within 1 second
- [ ] Optimistic updates don't conflict with SSE messages
- [ ] If SSE disconnects, auto-reconnect with exponential backoff (max 30s)
- [ ] Connection status indicator shows Live/Offline accurately
- [ ] No data loss during reconnection

### Done Definition

Two users see consistent, real-time data for the same venue.

---

## Evaluation Criteria for AI Agents

When implementing or modifying flows, evaluate against:

| Criterion            | Weight | Description                                                  |
| -------------------- | ------ | ------------------------------------------------------------ |
| **Functionality**    | 30%    | Does the flow complete end-to-end without errors?            |
| **Data Consistency** | 25%    | Is state correct across pages, SSE, and API?                 |
| **Error Recovery**   | 20%    | Does the UI handle failures gracefully with retry?           |
| **Accessibility**    | 15%    | Can the flow be completed with keyboard only? Screen reader? |
| **Mobile UX**        | 10%    | Does the flow work on 375px width?                           |
