export function PrivacyPage() {
  return (
    <main
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
          This site sets no analytics cookies. Our edge server keeps a cookie-free request log: the
          route, method, country, page path, response status and response time of each request. It
          stores no cookie, IP address or other identifier. Separately, each page you open tells our
          error tracker a visit started, so it can count how often pages fail. When a page does
          fail, an error report goes to the same tracker; it can include your browser, operating
          system and IP address. Apart from the IP address an error report can carry, we collect no
          personal information unless you give it to us.
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
          Essential cookies are required for the site to function. Functional and Marketing cookies
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
          Error reports are processed by Sentry, and pages are served through Cloudflare. Each is
          governed by its own privacy policy.
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
    </main>
  );
}

PrivacyPage.displayName = "PrivacyPage";
