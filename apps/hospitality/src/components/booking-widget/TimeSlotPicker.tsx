import type { TimeSlot } from "@mbe/types";

export interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  isLoading: boolean;
  error: string | null;
  onSelectSlot: (slot: TimeSlot) => void;
  onBack: () => void;
  date: string;
  partySize: number;
}

export function TimeSlotPicker({
  slots,
  selectedSlot,
  isLoading,
  error,
  onSelectSlot,
  onBack,
  date,
  partySize,
}: TimeSlotPickerProps) {
  // Format date for display
  const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Format ISO datetime for display
  const formatTime = (isoTime: string) => {
    const date = new Date(isoTime);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Get hour from ISO datetime for grouping
  const getHour = (isoTime: string) => {
    return new Date(isoTime).getHours();
  };

  // Group slots by meal period
  const groupedSlots = slots.reduce(
    (groups, slot) => {
      const hour = getHour(slot.time);
      let period: "lunch" | "dinner" | "late";
      if (hour < 15) {
        period = "lunch";
      } else if (hour < 20) {
        period = "dinner";
      } else {
        period = "late";
      }
      groups[period].push(slot);
      return groups;
    },
    { lunch: [] as TimeSlot[], dinner: [] as TimeSlot[], late: [] as TimeSlot[] }
  );

  const periodLabels = {
    lunch: "Lunch",
    dinner: "Dinner",
    late: "Late Night",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 text-red-600 p-4 rounded-md">{error}</div>
        <button
          onClick={onBack}
          className="text-blue-600 hover:underline text-sm"
        >
          &larr; Change date or party size
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-blue-600 hover:underline text-sm"
        >
          &larr; Back
        </button>
        <div className="text-right">
          <div className="font-medium text-gray-900">{formattedDate}</div>
          <div className="text-sm text-gray-500">
            {partySize} {partySize === 1 ? "guest" : "guests"}
          </div>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No available times for this date.</p>
          <p className="text-sm">Try a different date or party size.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(["lunch", "dinner", "late"] as const).map((period) => {
            const periodSlots = groupedSlots[period];
            if (periodSlots.length === 0) return null;

            return (
              <div key={period}>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  {periodLabels[period]}
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {periodSlots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => onSelectSlot(slot)}
                      className={`py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        selectedSlot?.time === slot.time
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {formatTime(slot.time)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedSlot && (
        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-800">
            Selected: <strong>{formatTime(selectedSlot.time)}</strong>
            {selectedSlot.tables && selectedSlot.tables.length > 0 && (
              <span className="text-blue-600">
                {" "}- {selectedSlot.tables.length} table{selectedSlot.tables.length > 1 ? "s" : ""} available
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
