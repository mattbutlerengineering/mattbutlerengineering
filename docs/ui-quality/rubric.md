# UI-quality rubric — v1

The fixed bar every page in `apps/hospitality`, `apps/marketing` and
`apps/rialto-web` is held to by the daily `mbe-ui-quality` routine. This file is
the prose the judge reads; `rubric.json` beside it is the machine half (tell
ids, detection, default severity, route categories, the calibration pass mark).
`scripts/__tests__/ui-quality-rubric.test.mjs` pins one `###` heading here per
tell there, and the `tells_hash` guard fails CI when a tell changes without the
hash being recomputed.

**Only a human bumps `rubric_version`**, by PR to both files. The routine may
propose a bump through a `meta-improvement` issue; it never edits this file.

## How the judge uses this file

- Answer only with the tell ids below, in the Judge schema (per app,
  `.ui-quality/judged/<app>.json`). A tell id not listed here is dropped and
  counted, never filed.
- Name a **judged** tell only. Mechanical tells are found by
  `detect.mjs mechanical` from the capture manifest; the judge never names them.
- Severity is the tell's `default_severity` in `rubric.json`, whatever the
  judge writes. A judged finding is never P1.
- An image you cannot read is `{ "route": "…", "unjudged": "tool-error" }` —
  never omitted and never `tells: []`, which means _judged clean_.
- Pages under `visual-test` are test harnesses: their bugs still count, their
  taste does not.

## Agent-built face (judged, P2)

The community-enumerated look of a page an agent generated and nobody designed.
Each is judged against a professional team's default, not against taste in
the abstract.

### agent-built/unrequested-dark-theme

**Looks like:** a permanent dark background on a page whose product or brand
never asked for one — black or near-black canvas, light text, with no light
variant or with the light variant as an afterthought.

**A professional team instead:** follows the brand's colour scheme (rialto's
`--rialto-surface-*` tokens) and honours `prefers-color-scheme`, shipping dark
only as a supported theme, not as the only look.

### agent-built/gradient-background

**Looks like:** a purple-to-blue (or any two-hue) gradient filling a hero, card
or whole page as decoration, carrying no information.

**A professional team instead:** uses flat surfaces from the token palette and
reserves colour for meaning — state, emphasis, brand accent — so the eye goes
where the content is.

### agent-built/icon-card-grid

**Looks like:** a grid of equal cards, each an icon in a tinted circle over a
two-word title and one sentence of filler.

**A professional team instead:** shows the actual product — a screenshot, a
real number, a working example — and lets layout follow the content's shape
rather than a template grid.

### agent-built/inter-headline

**Looks like:** headlines set in Inter (or the system sans) at a large weight,
identical to every generated landing page, with no typographic voice.

**A professional team instead:** uses the design system's display face and type
scale (rialto `--rialto-font-display`, `Heading` levels) so the headline reads
as this product and not a starter template.

### agent-built/gray-card-border

**Looks like:** every container outlined with a 1 px light-gray border and a
faint shadow, boxes inside boxes, the border doing the work spacing should.

**A professional team instead:** groups with spacing and surface elevation
(rialto `--rialto-space-*`, surface tokens), using a rule only where two
regions genuinely need separating.

### agent-built/three-feature-card-row

**Looks like:** exactly three side-by-side cards of equal weight — "Fast",
"Secure", "Scalable" — regardless of how many things there are to say.

**A professional team instead:** says as many things as are true, in the order
that matters, and gives the most important one more room than the rest.

### agent-built/generic-hero-copy

**Looks like:** a hero line that could sit on any product — "Build faster with
AI", "The future of X is here", "Everything you need in one place" — with no
noun from this domain in it.

**A professional team instead:** names what the product does for whom in the
product's own vocabulary (tables, covers, reservations, components), specific
enough that it could not be pasted onto a competitor's page.

## Accessibility face — semantic faults axe cannot see (judged, P2)

The CHI EA '26 fault types: pages that pass axe because the attribute exists,
yet fail the person relying on it.

### accessibility/non-descriptive-alt

**Looks like:** `alt="image"`, `alt="logo"`, `alt="photo"`, a filename, or alt
text that describes pixels ("blue rectangle") instead of purpose. axe's
`image-alt` passes all of these.

**A professional team instead:** writes alt text for what the image tells the
reader in context, and marks purely decorative images `alt=""`.

### accessibility/vague-link-purpose

**Looks like:** "click here", "learn more", "read more", "details" — several
identical link texts on one page pointing at different places. axe's
`link-name` passes them because a name exists.

**A professional team instead:** makes each link's text say where it goes
("View the Button component", "Manage your reservation"), or adds an
`aria-label` that does when the visible text must stay short.

### accessibility/heading-content-mismatch

**Looks like:** a heading that does not describe the section under it — a
slogan as an `h2`, headings chosen for size rather than level, a section of
settings under "Overview". axe's `empty-heading` only catches the empty case.

**A professional team instead:** makes every heading an accurate title for its
section and keeps levels in outline order, so the heading list alone is a
usable table of contents.

## Bugs face (mechanical)

Found by `detect.mjs mechanical` from the capture manifest; listed here so the
judge knows they exist and never names them itself.

### bugs/blank-render

**Looks like:** the page loads but the main landmark has no text and almost
nothing is painted — a white screen, a spinner that never resolves, an error
boundary with no message. **P1.**

**A professional team instead:** renders content, a skeleton, or an actionable
error state on every route, and never ships a route that can paint nothing.

### bugs/unhandled-error

**Looks like:** an uncaught exception (`pageerror`) during load. **P1.**

**A professional team instead:** catches at a boundary, reports to Sentry and
renders a recoverable state; an uncaught error on load is a defect even when
the page looks fine.

### bugs/dead-in-app-link

**Looks like:** a same-origin link whose path matches no route of its app and
is not a redirect or catch-all target — a click that lands on "not found".
**P1.**

**A professional team instead:** links only to routes that exist, derived from
the router rather than typed by hand.

### bugs/failed-request

**Looks like:** a same-origin request that fails (network error or HTTP ≥ 400)
while the page loads. **P2.**

**A professional team instead:** requests only what the page needs, handles
the failure visibly, and never leaves a broken asset or API call in a shipped
route.

## Accessibility face — the axe floor (mechanical)

Every axe-core violation on the page, all rules and impacts on, with
`color-contrast` included — a full-page audit, not a token test. One tell per
axe impact level.

### accessibility/axe-critical

**Looks like:** an axe violation of impact `critical` — e.g. a form control or
button with no accessible name, an image map with no alt. **P1.**

**A professional team instead:** treats a critical axe violation as a blocker:
the page is unusable for someone relying on assistive technology.

### accessibility/axe-serious

**Looks like:** an axe violation of impact `serious` — e.g. insufficient
colour contrast, a missing document language. **P2.**

**A professional team instead:** fixes it with the design system's tokens
(rialto's contrast-checked palette) rather than a one-off colour.

### accessibility/axe-moderate

**Looks like:** an axe violation of impact `moderate` — e.g. content outside a
landmark, a skipped heading level. **P2.**

**A professional team instead:** keeps pages inside the app shell's landmarks
and headings in outline order.

### accessibility/axe-minor

**Looks like:** an axe violation of impact `minor`. **P2.**

**A professional team instead:** fixes it when the page is next touched; minor
is still a defect, just not an urgent one.
