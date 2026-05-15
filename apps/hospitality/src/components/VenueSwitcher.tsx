import { useState, useRef, useEffect, useCallback } from "react";
import { useVenue } from "../contexts/VenueContext.js";
import styles from "./VenueSwitcher.module.css";

interface VenueSwitcherProps {
  onNavigate: (path: string) => void;
}

export function VenueSwitcher({ onNavigate }: VenueSwitcherProps) {
  const { venues, selectedVenue, setVenueId, isMultiVenue } = useVenue();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    if (isMultiVenue) {
      setIsOpen((prev) => !prev);
    }
  }, [isMultiVenue]);

  const handleSelect = useCallback(
    (id: string) => {
      setVenueId(id);
      setIsOpen(false);
    },
    [setVenueId]
  );

  const handleAddVenue = useCallback(() => {
    setIsOpen(false);
    onNavigate("/onboarding");
  }, [onNavigate]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!selectedVenue) return null;

  return (
    <div ref={containerRef} className={styles.root}>
      <button
        type="button"
        className={`${styles.trigger} ${isMultiVenue ? styles.triggerInteractive : ""}`}
        onClick={handleToggle}
        aria-haspopup={isMultiVenue ? "listbox" : undefined}
        aria-expanded={isMultiVenue ? isOpen : undefined}
        aria-label={
          isMultiVenue
            ? `Current venue: ${selectedVenue.name}. Click to switch`
            : selectedVenue.name
        }
      >
        <span className={styles.venueName}>{selectedVenue.name}</span>
        {isMultiVenue && (
          <svg
            className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="listbox" aria-label="Select venue">
          {venues.map((venue) => (
            <button
              key={venue.id}
              type="button"
              role="option"
              aria-selected={venue.id === selectedVenue.id}
              className={`${styles.option} ${venue.id === selectedVenue.id ? styles.optionSelected : ""}`}
              onClick={() => handleSelect(venue.id)}
            >
              {venue.name}
              {venue.id === selectedVenue.id && (
                <svg
                  className={styles.checkmark}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
          <div className={styles.divider} aria-hidden="true" />
          <button type="button" className={styles.addVenue} onClick={handleAddVenue}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Venue
          </button>
        </div>
      )}
    </div>
  );
}

VenueSwitcher.displayName = "VenueSwitcher";
