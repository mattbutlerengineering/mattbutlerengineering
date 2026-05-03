export function PrivacyPage() {
  return (
    <div
      style={{
        maxWidth: "680px",
        margin: "0 auto",
        padding: "var(--rialto-space-2xl) var(--rialto-space-xl)",
        color: "var(--rialto-text-primary)",
        fontFamily: "var(--rialto-font-sans)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--rialto-text-2xl)",
          fontWeight: "var(--rialto-weight-semibold)",
          marginBottom: "var(--rialto-space-sm)",
        }}
      >
        Privacy Policy
      </h1>
      <p
        style={{
          fontSize: "var(--rialto-text-sm)",
          color: "var(--rialto-text-tertiary)",
          marginBottom: "var(--rialto-space-xl)",
        }}
      >
        Last updated: April 2026
      </p>

      <section style={{ marginBottom: "var(--rialto-space-xl)" }}>
        <h2
          style={{
            fontSize: "var(--rialto-text-lg)",
            fontWeight: "var(--rialto-weight-medium)",
            marginBottom: "var(--rialto-space-sm)",
          }}
        >
          What we collect
        </h2>
        <p
          style={{
            fontSize: "var(--rialto-text-md)",
            lineHeight: 1.6,
            color: "var(--rialto-text-secondary)",
          }}
        >
          When you visit this site, we may collect anonymous usage data via analytics cookies (e.g.
          page views, referrer, session duration). We do not collect personally identifiable
          information unless you voluntarily provide it.
        </p>
      </section>

      <section style={{ marginBottom: "var(--rialto-space-xl)" }}>
        <h2
          style={{
            fontSize: "var(--rialto-text-lg)",
            fontWeight: "var(--rialto-weight-medium)",
            marginBottom: "var(--rialto-space-sm)",
          }}
        >
          Cookies
        </h2>
        <p
          style={{
            fontSize: "var(--rialto-text-md)",
            lineHeight: 1.6,
            color: "var(--rialto-text-secondary)",
          }}
        >
          We use cookies to remember your preferences and understand how visitors use the site.
          Essential cookies are required for the site to function. Analytics and functional cookies
          are optional and only set with your consent. You can change your preferences at any time
          using the cookie banner.
        </p>
      </section>

      <section style={{ marginBottom: "var(--rialto-space-xl)" }}>
        <h2
          style={{
            fontSize: "var(--rialto-text-lg)",
            fontWeight: "var(--rialto-weight-medium)",
            marginBottom: "var(--rialto-space-sm)",
          }}
        >
          Third-party services
        </h2>
        <p
          style={{
            fontSize: "var(--rialto-text-md)",
            lineHeight: 1.6,
            color: "var(--rialto-text-secondary)",
          }}
        >
          This site may use third-party analytics providers. These providers may set their own
          cookies and are governed by their respective privacy policies.
        </p>
      </section>

      <section>
        <h2
          style={{
            fontSize: "var(--rialto-text-lg)",
            fontWeight: "var(--rialto-weight-medium)",
            marginBottom: "var(--rialto-space-sm)",
          }}
        >
          Contact
        </h2>
        <p
          style={{
            fontSize: "var(--rialto-text-md)",
            lineHeight: 1.6,
            color: "var(--rialto-text-secondary)",
          }}
        >
          Questions about this policy? Reach out at{" "}
          <a
            href="mailto:hello@mattbutlerengineering.com"
            style={{ color: "var(--rialto-color-brand)" }}
          >
            hello@mattbutlerengineering.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}

PrivacyPage.displayName = "PrivacyPage";
