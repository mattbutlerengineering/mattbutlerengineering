# Launch demo videos

A short demo video for a big release, asked about once a month. Nothing is recorded
until the Owner says yes.

## How a video gets made

1. On the 1st of each month `mbe-monthly-meta-audit` looks at the previous month. If it
   finds big releases it opens one `ready-for-human` issue titled
   `promo video candidate <YYYY-MM>: <slug>`. No candidates means no issue.
2. Close that issue to skip the month. To go ahead, run the command in the issue in a
   local session: `/idea-to-prod:launch-demo <run-slug>` (or `--pr <N>`). The recorder
   needs a dev server, so set `against` in [`launch-demo.json`](./launch-demo.json) to
   the page to tour and start it first. Cloud routines cannot record.
3. The skill writes `docs/launches/<slug>/launch.md`, `storyboard.json` and
   `launch.mp4`. It never commits.

## Publishing on the marketing site

Videos show on `/shipped/<slug>` ("Watch the demo") and the newest one is featured on
`/shipped` ("Latest release"). Their data lives in
`apps/marketing/src/data/shipped-videos.json`, apart from the weekly-regenerated
`shipped-features.json`.

1. Copy `launch.mp4` to `apps/marketing/public/videos/<shipped-slug>.mp4`. The slug is
   the one in `shipped-features.json`, not the run slug.
2. Add an entry to `shipped-videos.json`: `slug`, `src` (`/videos/<shipped-slug>.mp4`),
   `title`, `transcript` (the copy from `launch.md`) and `recordedAt` (`YYYY-MM-DD`).
   The guard in `shipped-videos.ts` drops the whole file if any entry is invalid.
3. Open a PR `feat(marketing): promo video <YYYY-MM> — <feature>` that closes the
   promo-video issue.

Keep files small: they ship in the Worker's static assets and are not precached.
