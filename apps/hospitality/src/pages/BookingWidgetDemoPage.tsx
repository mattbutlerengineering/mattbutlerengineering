import { useState } from "react";
import { BookingWidget } from "../components/booking-widget";

export function BookingWidgetDemoPage() {
  const [venueId, setVenueId] = useState("");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Booking Widget Demo</h1>
        <p className="text-gray-600">
          Preview the embeddable booking widget. This is what guests see when making a reservation.
        </p>
      </div>

      {/* Venue ID input for testing */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Venue ID (for testing)
        </label>
        <input
          type="text"
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          placeholder="Enter venue ID"
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md"
        />
        <p className="mt-2 text-sm text-gray-500">
          Enter a venue ID to test the widget with real availability data.
        </p>
      </div>

      {/* Widget preview */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* Widget container */}
        <div>
          <h2 className="text-lg font-medium mb-4">Widget Preview</h2>
          <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
            {venueId ? (
              <BookingWidget venueId={venueId} />
            ) : (
              <div className="text-center py-12 text-gray-400">
                Enter a venue ID above to preview the widget
              </div>
            )}
          </div>
        </div>

        {/* Embed code */}
        <div>
          <h2 className="text-lg font-medium mb-4">Embed Code</h2>
          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300">
              <code>{`<!-- Add to your website -->
<div id="booking-widget"></div>
<script src="https://your-domain.com/widget.js"></script>
<script>
  BookingWidget.init({
    container: '#booking-widget',
    venueId: '${venueId || "YOUR_VENUE_ID"}',
    // Optional customization
    maxPartySize: 8,
  });
</script>`}</code>
            </pre>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            The widget can be embedded on any website. Styles are self-contained
            and will not conflict with your existing CSS.
          </p>
        </div>
      </div>

      {/* Features list */}
      <div className="mt-12">
        <h2 className="text-lg font-medium mb-4">Widget Features</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-4 bg-white rounded-lg border">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-medium mb-1">Real-time Availability</h3>
            <p className="text-sm text-gray-600">
              Shows only available time slots based on current reservations and capacity.
            </p>
          </div>
          <div className="p-4 bg-white rounded-lg border">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-medium mb-1">10-Minute Hold</h3>
            <p className="text-sm text-gray-600">
              Selected times are held for 10 minutes while guests complete their booking.
            </p>
          </div>
          <div className="p-4 bg-white rounded-lg border">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-medium mb-1">Instant Confirmation</h3>
            <p className="text-sm text-gray-600">
              Guests receive immediate confirmation with their reservation details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
