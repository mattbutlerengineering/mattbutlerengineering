# Autorun brief — hospitality-above-fold-usability

stop-after: decompose

- **Run scale:** feature. Slug: `hospitality-above-fold-usability`.
- **Source:** GitHub issue #6367 (verbatim goal: "Audit our hospitality
  website. We have a lot of pages that have most of the useful content
  below the fold and a lot of extra whitespace above the fold. Improve
  usability in this area.") Estimated complexity S.
- **What and why:** Many hospitality app pages push their useful content
  below the fold behind oversized headers/whitespace. Audit the pages,
  then reduce above-the-fold dead space so the primary content is visible
  on load.
- **Who suffers:** Venue staff (hosts, managers) using the hospitality
  dashboard on laptop-class viewports (~1366×768 and 1280×800), where
  vertical pixels are scarce.
- **Evidence:** Matt's own observation in #6367 (anecdote, labelled as
  such). The audit work item produces the measured evidence.
- **Solution hunch:** Tighten shared layout chrome (page header spacing,
  page-level padding) and per-page hero/intro blocks; a shared fix beats
  N per-page fixes where the audit shows the spacing comes from shared
  components.
- **Success:** On a 768px-tall viewport, each audited page shows at least
  the start of its primary content (table, list, form, chart) without
  scrolling.
- **Scope in:** `apps/hospitality` pages and the shared layout/header
  components they use. Scope out: marketing site, rialto-web showcase,
  rialto token redesign, responsive/mobile rework beyond the fold fix.
- **Constraints:** Rialto design system stays the source of spacing
  tokens; keep brand vibe (speakeasy/high-class); a11y never traded away;
  surgical diffs per repo guidelines.
- **Unknowns / ways this dies:** spacing may come from rialto components
  shared with other apps (blast radius); visual-baseline churn (±1px
  cascade gotcha) may make per-page fixes expensive.
- **Tracker:** run seeded from issue #6367; breakdown work items mirror to
  the tracker per ADR-0026 convention, carrying `(tracker: #6367)` on
  items that close it. No new tracker issues created by this run.
- **UX surface:** yes — `ux: required`.
- **Reserved ids (from conductor item block):** prd 1, adr 31–33,
  wo 6–15. Use only these.
- **Release authorization:** none — prepare-and-stop default; moot here
  because `stop-after: decompose` ends the run at the blueprint gate for
  human review.
