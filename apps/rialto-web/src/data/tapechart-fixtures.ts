import type {
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
