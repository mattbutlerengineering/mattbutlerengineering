# Visual Regression Tests Design

## Goal

Catch visual regressions on PRs and document component states as a visual catalog.

## Approach

Playwright screenshot tests against a dedicated test harness page.

- **No paid services** — Playwright's built-in `toHaveScreenshot()` with local baselines
- **Baselines in git** — `e2e/screenshots/` (~2-5MB)
- **CI on PRs** — new job in `ci.yml`

## Test Harness Page

Route: `/visual-test` (dev/test only, excluded from production)

Renders each component in stable isolated cards with `data-testid` attributes. Fixed viewport (1280x720), reduced motion forced.

## Component Coverage (15 core interactive)

| Component  | States                                                         |
| ---------- | -------------------------------------------------------------- |
| Button     | primary, secondary, ghost, danger, disabled, loading, sm/md/lg |
| Input      | empty, filled, error, disabled, with hint                      |
| Select     | closed, open, disabled                                         |
| Toggle     | on, off, disabled                                              |
| Checkbox   | unchecked, checked, indeterminate, disabled                    |
| Slider     | default, disabled                                              |
| Tabs       | default with active tab                                        |
| Dialog     | open                                                           |
| Card       | default, with title/subtitle                                   |
| Alert      | info, success, warning, error                                  |
| Badge      | neutral, info, success, warning, error, sizes                  |
| Table      | with data, striped, empty                                      |
| Toast      | success, error, warning, info                                  |
| Progress   | determinate, indeterminate                                     |
| EmptyState | with icon, with action                                         |

Both light and dark mode for each component.

## CI Integration

- New job `visual-tests` in `ci.yml`
- Install Playwright browsers, start dev server, run screenshot tests
- Update baselines: `npx playwright test --update-snapshots`

## File Structure

```
e2e/
  visual.spec.ts          # Playwright test file
  screenshots/            # Baseline snapshots (committed)
playwright.config.ts      # Playwright config
src/pages/visual-test/
  VisualTest.tsx           # Test harness page
  VisualTest.module.css    # Minimal styling
```
