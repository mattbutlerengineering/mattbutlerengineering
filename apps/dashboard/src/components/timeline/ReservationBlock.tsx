import type { Reservation, ReservationStatus } from "@mbe/types";

export interface ReservationBlockProps {
  reservation: Reservation;
  style: { left: number; width: number };
  isSelected?: boolean;
  onClick?: () => void;
}

const STATUS_COLORS: Record<ReservationStatus, { bg: string; border: string; text: string }> = {
  PENDING: {
    bg: "bg-yellow-100",
    border: "border-yellow-400",
    text: "text-yellow-800",
  },
  CONFIRMED: {
    bg: "bg-blue-100",
    border: "border-blue-400",
    text: "text-blue-800",
  },
  CANCELLED: {
    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-500",
  },
  COMPLETED: {
    bg: "bg-green-100",
    border: "border-green-400",
    text: "text-green-800",
  },
  NO_SHOW: {
    bg: "bg-red-100",
    border: "border-red-400",
    text: "text-red-800",
  },
};

export function ReservationBlock({
  reservation,
  style,
  isSelected = false,
  onClick,
}: ReservationBlockProps) {
  const colors = STATUS_COLORS[reservation.status];

  // Format time for display
  const formatTime = (isoTime: string) => {
    return new Date(isoTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const startTime = formatTime(reservation.startTime);
  const guestName = reservation.guestName || "Guest";

  return (
    <button
      onClick={onClick}
      className={`absolute top-1 bottom-1 rounded-md border-l-4 px-2 py-1 overflow-hidden cursor-pointer transition-all hover:shadow-md ${colors.bg} ${colors.border} ${
        isSelected ? "ring-2 ring-blue-500 ring-offset-1" : ""
      }`}
      style={{
        left: style.left,
        width: Math.max(style.width - 4, 40), // Minimum width for visibility
      }}
      title={`${guestName} - ${reservation.partySize} guests at ${startTime}`}
    >
      <div className="flex flex-col h-full justify-center">
        <div className={`text-xs font-medium truncate ${colors.text}`}>
          {guestName}
        </div>
        <div className={`text-xs truncate ${colors.text} opacity-75`}>
          {reservation.partySize} · {startTime}
        </div>
      </div>
    </button>
  );
}
