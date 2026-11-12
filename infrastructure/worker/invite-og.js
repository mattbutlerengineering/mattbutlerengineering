/**
 * Link-preview (og:) tags for the public party invite page, /i/:token
 * (The Invitation, #8666).
 *
 * Chat apps unfurl a link from the HTML head the server returns, and the
 * hospitality SPA only fills its head after JavaScript runs. So the edge
 * fetches the invite's allow-listed public view and rewrites the head.
 *
 * Privacy: the public invite payload carries no booker PII and the token never
 * grants manage rights; only venue name, date, time and party size are used
 * here. RSVP names are deliberately left out of the preview.
 *
 * Fail-open: any failure to fetch or parse the invite yields the generic
 * invite tags. The page itself is always served.
 *
 * Image: a STATIC per-venue PNG (`/og/venues/<slug>.png` in the hospitality
 * static assets), falling back to the generic hospitality preview when a venue
 * has none. The dynamic renderer is a separate deferred issue.
 */

const INVITE_PATH = /^\/i\/([A-Za-z0-9._-]{1,200})$/;
const VENUE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const INVITE_FETCH_TIMEOUT_MS = 1500;
const IMAGE_HEAD_TIMEOUT_MS = 1500;
const GENERIC_IMAGE_PATH = "/og-hospitality.png";
const GENERIC_TITLE = "You're invited";
const GENERIC_DESCRIPTION =
  "Open your invitation to see the details and let everyone know you're in.";

/** The invite token in a hospitality-relative path ("/i/<token>"), or null. */
function inviteTokenFrom(strippedPath) {
  const match = INVITE_PATH.exec(strippedPath);
  return match ? match[1] : null;
}

/** Escape a value for use inside a double- or single-quoted HTML attribute. */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Fetch the invite's public view. Resolves to { venue, date, time, partySize }
 * for a live invite, or null for anything else (missing, ended, slow, malformed).
 */
async function fetchInvite(token, env) {
  try {
    const response = await fetch(
      `${env.API_ORIGIN}/public/v1/invites/${encodeURIComponent(token)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(INVITE_FETCH_TIMEOUT_MS),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json())?.data;
    if (typeof data?.venue?.name !== "string" || data.venue.name.length === 0) return null;
    return data;
  } catch (error) {
    console.error("Invite og fetch failed:", error.message);
    return null;
  }
}

/** True when the static assets hold a PNG for this venue slug. */
async function venueImageExists(slug, staticBinding, bindingOrigin) {
  if (typeof slug !== "string" || !VENUE_SLUG.test(slug)) return false;
  try {
    const response = await staticBinding.fetch(
      new Request(new URL(`/og/venues/${slug}.png`, bindingOrigin), {
        method: "HEAD",
        signal: AbortSignal.timeout(IMAGE_HEAD_TIMEOUT_MS),
      })
    );
    return (
      response.status === 200 && (response.headers.get("Content-Type") ?? "").includes("image/png")
    );
  } catch {
    return false;
  }
}

function describeInvite(invite) {
  const when = [invite.date, invite.time].filter((v) => typeof v === "string" && v).join(" at ");
  const party = Number.isInteger(invite.partySize) ? `party of ${invite.partySize}` : "";
  return [when, party].filter(Boolean).join(" · ");
}

/**
 * The meta-tag HTML to inject. `invite` null → generic tags.
 *
 * @param {{ invite: object|null, pageUrl: string, imageUrl: string }} input
 */
function buildInviteMeta({ invite, pageUrl, imageUrl }) {
  const title = invite ? `You're invited to ${invite.venue.name}` : GENERIC_TITLE;
  const details = invite ? describeInvite(invite) : "";
  const description = details ? `Join us: ${details}. Tap to RSVP.` : GENERIC_DESCRIPTION;
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  const img = escapeAttr(imageUrl);
  const alt = escapeAttr(invite ? `${invite.venue.name} invitation` : "Party invitation");
  return [
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:alt" content="${alt}">`,
    `<meta property="og:url" content="${escapeAttr(pageUrl)}">`,
    `<meta property="og:type" content="website">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<meta name="robots" content="noindex, nofollow">`,
  ].join("");
}

/**
 * Replace the page's own og:/twitter: tags with invite-specific ones.
 * Never throws: on any failure the original response is returned.
 *
 * @param {Response} response The hospitality HTML response (200, text/html).
 * @param {object} ctx
 * @param {string} ctx.token Invite token from the path.
 * @param {object} ctx.env Worker env (API_ORIGIN).
 * @param {{ fetch: Function }} ctx.staticBinding Hospitality service binding.
 * @param {string} ctx.bindingOrigin Origin used for static-asset subrequests.
 * @param {URL} ctx.url The public request URL.
 * @param {string} ctx.publicPrefix Public path prefix of the hospitality app ("" or "/hospitality").
 */
async function injectInviteMeta(response, ctx) {
  try {
    const { token, env, staticBinding, bindingOrigin, url, publicPrefix } = ctx;
    const invite = await fetchInvite(token, env);
    const hasImage =
      invite && (await venueImageExists(invite.venue.slug, staticBinding, bindingOrigin));
    const imagePath = hasImage ? `/og/venues/${invite.venue.slug}.png` : GENERIC_IMAGE_PATH;
    const meta = buildInviteMeta({
      invite,
      pageUrl: `${url.origin}${url.pathname}`,
      imageUrl: `${url.origin}${publicPrefix}${imagePath}`,
    });
    const strip = { element: (el) => el.remove() };
    return new HTMLRewriter()
      .on('meta[property^="og:"]', strip)
      .on('meta[name^="twitter:"]', strip)
      .on('meta[name="robots"]', strip)
      .on("head", { element: (el) => el.append(meta, { html: true }) })
      .transform(response);
  } catch (error) {
    console.error("Invite og injection failed:", error.message);
    return response;
  }
}

export { inviteTokenFrom, injectInviteMeta };
