import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { Guest, GuestSegment } from "@mbe/types";

export function GuestsPage() {
  const { accessToken } = useAuth();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [segments, setSegments] = useState<GuestSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [venueId] = useState(""); // TODO: Get from context or URL

  useEffect(() => {
    if (!venueId) {
      setIsLoading(false);
      return;
    }

    async function fetchGuests() {
      setIsLoading(true);
      setError(null);

      try {
        const api = createApiClient({
          baseUrl: import.meta.env.VITE_API_URL ?? "",
          getAccessToken: () => accessToken,
        });

        const [guestsResponse, segmentsResponse] = await Promise.all([
          searchQuery
            ? api.guests.search({ venueId, query: searchQuery })
            : api.guests.list({ venueId, limit: 50 }),
          api.guests.getSegments(venueId),
        ]);

        setGuests(guestsResponse.data);
        setSegments(segmentsResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load guests");
      } finally {
        setIsLoading(false);
      }
    }

    fetchGuests();
  }, [venueId, searchQuery, accessToken]);

  const formatDate = (isoString: string | null) => {
    if (!isoString) return "Never";
    return new Date(isoString).toLocaleDateString();
  };

  if (!venueId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Guests</h1>
        <div className="bg-yellow-50 text-yellow-700 p-4 rounded-md">
          Please select a venue to view guests.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Guests</h1>
        <input
          type="text"
          placeholder="Search guests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
      </div>

      {/* Segments Overview */}
      {segments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {segments.map((segment) => (
            <div
              key={segment.name}
              className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500"
            >
              <div className="text-2xl font-bold text-gray-900">{segment.count}</div>
              <div className="text-sm text-gray-500">{segment.name}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-4">{error}</div>
      )}

      {!isLoading && !error && guests.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchQuery ? "No guests found matching your search" : "No guests yet"}
        </div>
      )}

      {!isLoading && !error && guests.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Guest
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Visits
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Visit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tags
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {guests.map((guest) => (
                <tr key={guest.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{guest.name}</div>
                    {guest.notes && (
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {guest.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {guest.email && (
                      <div className="text-sm text-gray-900">{guest.email}</div>
                    )}
                    {guest.phone && (
                      <div className="text-sm text-gray-500">{guest.phone}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {guest.visitCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(guest.lastVisit)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {guest.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
