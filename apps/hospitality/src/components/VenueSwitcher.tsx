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

  // Roving tabindex (ARIA APG listbox pattern): only `activeIndex` is a Tab
  // stop; arrow keys move it and move DOM focus with it. All option buttons
  // are already mounted while the dropdown is open, so moving the active
  // index can focus the target synchronously — no effect needed here.
  const [activeIndex, setActiveIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveActive = useCallback((index: number) => {
    setActiveIndex(index);
    optionRefs.current[index]?.focus();
  }, []);

  // Opening the dropdown activates and focuses the currently-selected option
  // (ARIA APG: focus moves into the listbox on open). Runs once per open, not
  // on every venues/selectedVenue re-render.
  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = venues.findIndex((venue) => venue.id === selectedVenue?.id);
    const initialIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(initialIndex);
    optionRefs.current[initialIndex]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    if (isMultiVenue) {
      setIsOpen((prev) => !prev);
    }
  }, [isMultiVenue]);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // isMultiVenue guarantees venues.length > 1 whenever the listbox renders.
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveActive((activeIndex + 1) % venues.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          moveActive((activeIndex - 1 + venues.length) % venues.length);
          break;
        case "Home":
          e.preventDefault();
          moveActive(0);
          break;
        case "End":
          e.preventDefault();
          moveActive(venues.length - 1);
          break;
      }
    },
    [activeIndex, venues.length, moveActive]
  );

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
        <div
          className={styles.dropdown}
          role="listbox"
          aria-label="Select venue"
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
        >
          {venues.map((venue, index) => (
            <button
              key={venue.id}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              type="button"
              role="option"
              aria-selected={venue.id === selectedVenue.id}
              tabIndex={index === activeIndex ? 0 : -1}
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
