import type {
  TapeChartOverlapKind,
  TapeChartReservation,
  TapeChartRoom,
  TapeChartRoomStatus,
  TapeChartStatus,
} from "@mattbutlerengineering/rialto";

// Deterministic seed-based RNG — so demo fixtures stay stable across reloads.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n);
  return new Date(ms).toISOString().slice(0, 10);
}

const FIRST_NAMES = [
  "Alison",
  "Ronith",
  "Tyrion",
  "Prakash",
  "Bri",
  "Hideo",
  "Anika",
  "Liam",
  "Yuki",
  "Noa",
  "Kenji",
  "Sofía",
  "Daniil",
  "Ingrid",
  "Mateo",
  "Priya",
  "Amir",
  "Clara",
  "Dmitri",
  "Fatima",
];
const LAST_NAMES = [
  "Woods",
  "NJ",
  "Lannister",
  "Mohankumar",
  "Chen",
  "Tanaka",
  "Patel",
  "O'Neill",
  "García",
  "Okonkwo",
  "Fischer",
  "Singh",
  "Rossi",
  "Hernández",
  "Bauer",
  "Suzuki",
];
const SOURCES = ["Direct", "Booking.com", "Expedia", "Go ibibo", "Make my Trip", "Agoda"];
const ROOM_STATUSES: TapeChartRoomStatus[] = ["ready", "dirty", "outOfOrder", "occupied"];

export function makeRooms(count = 30): TapeChartRoom[] {
  const rnd = mulberry32(42);
  const rooms: TapeChartRoom[] = [];
  for (let i = 0; i < count; i++) {
    const number = 1000 + i;
    const tier = i < count * 0.5 ? "Standard" : i < count * 0.85 ? "Deluxe" : "Suite";
    const capacity = tier === "Standard" ? 2 : tier === "Deluxe" ? 3 : 4;
    rooms.push({
      id: `room-${number}`,
      name: `${number}`,
      category: tier,
      capacity,
      status: ROOM_STATUSES[Math.floor(rnd() * ROOM_STATUSES.length)],
    });
  }
  return rooms;
}

export function makeReservations(
  rooms: TapeChartRoom[],
  startDate: string,
  endDate: string,
  density = 0.6
): TapeChartReservation[] {
  const rnd = mulberry32(7);
  const reservations: TapeChartReservation[] = [];
  const daysBetween = (a: string, b: string) => {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return Math.round(
      (Date.UTC(by ?? 1970, (bm ?? 1) - 1, bd ?? 1) -
        Date.UTC(ay ?? 1970, (am ?? 1) - 1, ad ?? 1)) /
        86400000
    );
  };
  const rangeDays = daysBetween(startDate, endDate);
  if (rangeDays <= 0) return [];

  for (const room of rooms) {
    let cursor = Math.floor(rnd() * 3); // small initial gap
    while (cursor < rangeDays) {
      if (rnd() > density) {
        cursor += 1 + Math.floor(rnd() * 3);
        continue;
      }
      const stayLength = 1 + Math.floor(rnd() * 5);
      const endOffset = Math.min(rangeDays, cursor + stayLength);
      if (endOffset - cursor < 1) break;
      const start = addDaysISO(startDate, cursor);
      const end = addDaysISO(startDate, endOffset);
      const guestName = `${FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]}`;
      const source = SOURCES[Math.floor(rnd() * SOURCES.length)];
      const status: TapeChartStatus =
        cursor < rangeDays / 2
          ? rnd() < 0.7
            ? "confirmed"
            : "checkedIn"
          : rnd() < 0.3
            ? "tentative"
            : "confirmed";
      reservations.push({
        id: `res-${room.id}-${cursor}`,
        roomId: room.id,
        start,
        end,
        status,
        guestName,
        partySize: 1 + Math.floor(rnd() * (room.capacity ?? 2)),
        ratePerNight: (100 + Math.floor(rnd() * 200)) * 100,
        currency: "USD",
        source,
      });
      cursor = endOffset + Math.floor(rnd() * 2);
    }
  }
  return reservations;
}

/**
 * Date-pinned overlap scenario for the Overlaps demo, Storybook and the visual harness.
 * Written as literals — `makeReservations`' cursor forbids overlaps by construction.
 * Guest names are deliberately outside FIRST_NAMES / LAST_NAMES so e2e locators stay unique.
 * Week of Mon 2026-03-02; `end` is the exclusive check-out day.
 */
export function makeOverlapScenario(): {
  rooms: TapeChartRoom[];
  reservations: TapeChartReservation[];
  startDate: "2026-03-02";
  endDate: "2026-03-09";
} {
  const rooms: TapeChartRoom[] = [
    { id: "ov-201", name: "201", category: "Standard", capacity: 2 },
    { id: "ov-202", name: "202", category: "Deluxe", capacity: 3 },
    { id: "ov-dorm-a", name: "Dorm A", category: "Dorm", capacity: 6 },
    { id: "ov-203", name: "203", category: "Standard", capacity: 2 },
  ];
  const base = { currency: "USD", source: "Direct" } as const;
  const reservations: TapeChartReservation[] = [
    // 201 — two private-room bookings that collide on Wed/Thu.
    {
      ...base,
      id: "ov-a",
      roomId: "ov-201",
      start: "2026-03-02",
      end: "2026-03-06",
      status: "confirmed",
      guestName: "Marisol Vega",
      partySize: 2,
      ratePerNight: 18000,
    },
    {
      ...base,
      id: "ov-b",
      roomId: "ov-201",
      start: "2026-03-04",
      end: "2026-03-08",
      status: "confirmed",
      guestName: "Tobias Lindqvist",
      partySize: 1,
      ratePerNight: 18000,
    },
    // 202 — a 3-deep stack; all three cover Thu 03-05.
    {
      ...base,
      id: "ov-c",
      roomId: "ov-202",
      start: "2026-03-02",
      end: "2026-03-07",
      status: "checkedIn",
      guestName: "Harriet Okafor",
      partySize: 2,
      ratePerNight: 24000,
    },
    {
      ...base,
      id: "ov-d",
      roomId: "ov-202",
      start: "2026-03-03",
      end: "2026-03-06",
      status: "tentative",
      guestName: "Elias Brandt",
      partySize: 3,
      ratePerNight: 24000,
    },
    {
      ...base,
      id: "ov-e",
      roomId: "ov-202",
      start: "2026-03-05",
      end: "2026-03-09",
      status: "confirmed",
      guestName: "Nadia Petrova",
      partySize: 2,
      ratePerNight: 24000,
    },
    // Dorm A — three bunks sharing one room: legitimate co-occupancy.
    {
      ...base,
      id: "ov-f",
      roomId: "ov-dorm-a",
      start: "2026-03-02",
      end: "2026-03-05",
      status: "confirmed",
      guestName: "Oscar Delacroix",
      partySize: 1,
      ratePerNight: 4500,
    },
    {
      ...base,
      id: "ov-g",
      roomId: "ov-dorm-a",
      start: "2026-03-02",
      end: "2026-03-06",
      status: "confirmed",
      guestName: "Wren Castellano",
      partySize: 1,
      ratePerNight: 4500,
    },
    {
      ...base,
      id: "ov-h",
      roomId: "ov-dorm-a",
      start: "2026-03-03",
      end: "2026-03-07",
      status: "confirmed",
      guestName: "Imani Adeyemi",
      partySize: 1,
      ratePerNight: 4500,
    },
    // 203 — a single booking, so the sibling row keeps its one-lane height.
    {
      ...base,
      id: "ov-i",
      roomId: "ov-203",
      start: "2026-03-03",
      end: "2026-03-07",
      status: "confirmed",
      guestName: "Lucas Moreau",
      partySize: 2,
      ratePerNight: 18000,
    },
  ];
  return { rooms, reservations, startDate: "2026-03-02", endDate: "2026-03-09" };
}

/** Demo rule: overlapping bunks in a Dorm are shared occupancy; any other overlap is a double-booking. */
export function classifyDormAsShared(
  rooms: TapeChartRoom[]
): (a: TapeChartReservation, b: TapeChartReservation) => TapeChartOverlapKind {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  return (a, _b) => (roomsById.get(a.roomId)?.category === "Dorm" ? "shared" : "conflict");
}

export function defaultDateRange() {
  // Anchor the start to the Thursday of the current week, extend 14 days.
  const today = new Date();
  const dayOfWeek = today.getUTCDay(); // 0=Sun..6=Sat
  const back = dayOfWeek >= 4 ? dayOfWeek - 4 : 7 - (4 - dayOfWeek);
  const startDate = new Date(today.getTime() - back * 86400000);
  const startIso = startDate.toISOString().slice(0, 10);
  const endIso = addDaysISO(startIso, 14);
  return { startDate: startIso, endDate: endIso };
}
