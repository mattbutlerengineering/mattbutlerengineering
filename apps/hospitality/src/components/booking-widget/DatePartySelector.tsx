
export interface DatePartySelectorProps {
  selectedDate: string | null;
  partySize: number;
  onDateChange: (date: string) => void;
  onPartySizeChange: (size: number) => void;
  onNext: () => void;
  minDate?: string;
  maxDate?: string;
  maxPartySize?: number;
}

const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export function DatePartySelector({
  selectedDate,
  partySize,
  onDateChange,
  onPartySizeChange,
  onNext,
  minDate,
  maxDate,
  maxPartySize = 8,
}: DatePartySelectorProps) {
  // Default min date to today
  const today = new Date().toISOString().split("T")[0];
  const effectiveMinDate = minDate ?? today;

  // Default max date to 30 days from now
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const effectiveMaxDate = maxDate ?? thirtyDaysFromNow.toISOString().split("T")[0];

  const partySizes = PARTY_SIZE_OPTIONS.filter((size) => size <= maxPartySize);

  const canProceed = selectedDate !== null && partySize > 0;

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Date
        </label>
        <input
          type="date"
          value={selectedDate ?? ""}
          onChange={(e) => onDateChange(e.target.value)}
          min={effectiveMinDate}
          max={effectiveMaxDate}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Party Size
        </label>
        <div className="grid grid-cols-4 gap-2">
          {partySizes.map((size) => (
            <button
              key={size}
              onClick={() => onPartySizeChange(size)}
              className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                partySize === size
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        {partySize > maxPartySize && (
          <p className="mt-2 text-sm text-gray-500">
            For parties larger than {maxPartySize}, please call us.
          </p>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        className={`w-full py-3 px-4 rounded-md text-sm font-medium transition-colors ${
          canProceed
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"
        }`}
      >
        Find Available Times
      </button>
    </div>
  );
}
