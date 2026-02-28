import type { Reservation } from "@mbe/types";

export interface ConfirmationViewProps {
  reservation: Reservation;
  onNewBooking: () => void;
}

export function ConfirmationView({
  reservation,
  onNewBooking,
}: ConfirmationViewProps) {
  // Format date for display
  const formattedDate = new Date(reservation.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Format time for display
  const formattedTime = new Date(reservation.startTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="text-center space-y-6">
      {/* Success icon */}
      <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
        <svg
          className="w-8 h-8 text-green-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Reservation Confirmed!
        </h2>
        <p className="text-gray-600">
          We look forward to seeing you.
        </p>
      </div>

      {/* Reservation details */}
      <div className="bg-gray-50 p-6 rounded-lg text-left">
        <h3 className="font-medium text-gray-900 mb-4">Reservation Details</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Confirmation #</dt>
            <dd className="font-mono text-gray-900">{reservation.id.slice(-8).toUpperCase()}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Date</dt>
            <dd className="text-gray-900">{formattedDate}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Time</dt>
            <dd className="text-gray-900">{formattedTime}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Party Size</dt>
            <dd className="text-gray-900">{reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}</dd>
          </div>
          {reservation.guestName && (
            <div className="flex justify-between">
              <dt className="text-gray-500">Name</dt>
              <dd className="text-gray-900">{reservation.guestName}</dd>
            </div>
          )}
          {reservation.table && (
            <div className="flex justify-between">
              <dt className="text-gray-500">Table</dt>
              <dd className="text-gray-900">{reservation.table.tableNumber || reservation.table.name}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Contact info note */}
      {(reservation.guestEmail || reservation.guestPhone) && (
        <p className="text-sm text-gray-500">
          A confirmation has been sent to{" "}
          {reservation.guestEmail || reservation.guestPhone}.
        </p>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={onNewBooking}
          className="w-full py-3 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Make Another Reservation
        </button>
      </div>
    </div>
  );
}
