import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { Guest, GuestSegment, Venue } from "@mbe/types";
import styles from "./GuestsPage.module.css";

export function GuestsPage() {
  const { accessToken } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [segments, setSegments] = useState<GuestSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  // Fetch venues on mount
  useEffect(() => {
    async function fetchVenues() {
      try {
        const response = await api.venues.list({ limit: 50 });
        setVenues(response.data);
        if (response.data.length > 0) {
          setSelectedVenueId(response.data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load venues");
      }
    }
    fetchVenues();
  }, [api]);

  useEffect(() => {
    if (!selectedVenueId) {
      setIsLoading(false);
      return;
    }

    async function fetchGuests() {
      setIsLoading(true);
      setError(null);

      try {
        const [guestsResponse, segmentsResponse] = await Promise.all([
          searchQuery
            ? api.guests.search({ venueId: selectedVenueId!, query: searchQuery })
            : api.guests.list({ venueId: selectedVenueId!, limit: 50 }),
          api.guests.getSegments(selectedVenueId!),
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
  }, [api, selectedVenueId, searchQuery]);

  const formatDate = (isoString: string | null) => {
    if (!isoString) return "Never";
    return new Date(isoString).toLocaleDateString();
  };

  if (!selectedVenueId) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Guests</h1>
        <div className={styles.noVenueNotice}>Please select a venue to view guests.</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Guests</h1>
        <div className={styles.headerControls}>
          {venues.length > 1 && (
            <select
              value={selectedVenueId ?? ""}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className={styles.venueSelector}
            >
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            placeholder="Search guests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Segments Overview */}
      {segments.length > 0 && (
        <div className={styles.segmentsGrid}>
          {segments.map((segment) => (
            <div key={segment.name} className={styles.segmentCard}>
              <div className={styles.segmentCount}>{segment.count}</div>
              <div className={styles.segmentName}>{segment.name}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div className={styles.loadingWrapper}>
          <div className={styles.spinner} />
        </div>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      {!isLoading && !error && guests.length === 0 && (
        <div className={styles.emptyState}>
          {searchQuery ? "No guests found matching your search" : "No guests yet"}
        </div>
      )}

      {!isLoading && !error && guests.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Guest</th>
                <th className={styles.th}>Contact</th>
                <th className={styles.th}>Visits</th>
                <th className={styles.th}>Last Visit</th>
                <th className={styles.th}>Tags</th>
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {guests.map((guest) => (
                <tr key={guest.id}>
                  <td className={styles.td}>
                    <div className={styles.guestName}>{guest.name}</div>
                    {guest.notes && (
                      <div className={styles.guestNotes}>{guest.notes}</div>
                    )}
                  </td>
                  <td className={styles.td}>
                    {guest.email && (
                      <div className={styles.contactPrimary}>{guest.email}</div>
                    )}
                    {guest.phone && (
                      <div className={styles.contactSecondary}>{guest.phone}</div>
                    )}
                  </td>
                  <td className={styles.td}>{guest.visitCount}</td>
                  <td className={styles.tdMuted}>{formatDate(guest.lastVisit)}</td>
                  <td className={styles.tdTags}>
                    <div className={styles.tagList}>
                      {guest.tags?.map((tag) => (
                        <span key={tag} className={styles.tag}>
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
