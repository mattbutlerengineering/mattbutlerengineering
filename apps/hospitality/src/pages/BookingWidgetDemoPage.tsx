import { useState } from "react";
import { BookingWidget } from "../components/booking-widget";
import styles from "./BookingWidgetDemoPage.module.css";

export function BookingWidgetDemoPage() {
  const [venueId, setVenueId] = useState("");

  return (
    <div className={styles.container}>
      <div className={styles.intro}>
        <h1 className={styles.title}>Booking Widget Demo</h1>
        <p className={styles.subtitle}>
          Preview the embeddable booking widget. This is what guests see when making a reservation.
        </p>
      </div>

      {/* Venue ID input for testing */}
      <div className={styles.venueSection}>
        <label className={styles.venueLabel}>Venue ID (for testing)</label>
        <input
          type="text"
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          placeholder="Enter venue ID"
          className={styles.venueInput}
        />
        <p className={styles.venueInputHint}>
          Enter a venue ID to test the widget with real availability data.
        </p>
      </div>

      {/* Widget preview */}
      <div className={styles.previewGrid}>
        {/* Widget container */}
        <div>
          <h2 className={styles.previewSectionTitle}>Widget Preview</h2>
          <div className={styles.widgetFrame}>
            {venueId ? (
              <BookingWidget venueId={venueId} />
            ) : (
              <div className={styles.widgetPlaceholder}>
                Enter a venue ID above to preview the widget
              </div>
            )}
          </div>
        </div>

        {/* Embed code */}
        <div>
          <h2 className={styles.previewSectionTitle}>Embed Code</h2>
          <div className={styles.codeBlock}>
            <pre className={styles.codeBlockPre}>
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
          <p className={styles.embedHint}>
            The widget can be embedded on any website. Styles are self-contained and will not
            conflict with your existing CSS.
          </p>
        </div>
      </div>

      {/* Features list */}
      <div className={styles.featuresSection}>
        <h2 className={styles.previewSectionTitle}>Widget Features</h2>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={`${styles.featureIconWrapper} ${styles.featureIconBlue}`}>
              <svg
                className={`${styles.featureIcon} ${styles.featureIconColorBlue}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>Real-time Availability</h3>
            <p className={styles.featureDescription}>
              Shows only available time slots based on current reservations and capacity.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={`${styles.featureIconWrapper} ${styles.featureIconGreen}`}>
              <svg
                className={`${styles.featureIcon} ${styles.featureIconColorGreen}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>10-Minute Hold</h3>
            <p className={styles.featureDescription}>
              Selected times are held for 10 minutes while guests complete their booking.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={`${styles.featureIconWrapper} ${styles.featureIconPurple}`}>
              <svg
                className={`${styles.featureIcon} ${styles.featureIconColorPurple}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>Instant Confirmation</h3>
            <p className={styles.featureDescription}>
              Guests receive immediate confirmation with their reservation details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
