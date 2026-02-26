# Versioning Strategy

Rialto follows [Semantic Versioning](https://semver.org/) (SemVer).

---

## Version Format

```
MAJOR.MINOR.PATCH
```

| Segment   | When to bump                                                                  | Example           |
| --------- | ----------------------------------------------------------------------------- | ----------------- |
| **MAJOR** | Breaking changes to component APIs, token names, or removal of public exports | `1.0.0` → `2.0.0` |
| **MINOR** | New components, new props on existing components, new tokens                  | `1.0.0` → `1.1.0` |
| **PATCH** | Bug fixes, accessibility fixes, documentation, internal refactors             | `1.0.0` → `1.0.1` |

---

## What Counts as Breaking

- Removing or renaming a component export
- Removing or renaming a prop
- Changing a prop's type in a way that breaks existing usage
- Removing or renaming a CSS custom property (`--rialto-*` token)
- Changing the visual output of a component in a way that breaks layouts (e.g., changing default size)

## What Does NOT Count as Breaking

- Adding a new optional prop
- Adding a new component
- Adding a new token
- Fixing a bug (even if someone depended on the buggy behavior)
- Improving accessibility (focus styles, ARIA attributes)
- Internal refactors that don't change the public API

---

## Changelog Format

Maintain a `CHANGELOG.md` in the repository root. Each release gets a section:

```markdown
## [1.2.0] - 2026-03-15

### Added

- `Meter` component for progress/gauge display
- `size="xl"` variant for Avatar

### Fixed

- Slider knob now meets WCAG 2.2 target size (24px minimum)
- Toast close button focus ring visibility

### Changed

- Badge border-radius uses `--rialto-radius-sharp` instead of hardcoded 2px
```

### Section Order

1. **Added** — new features
2. **Fixed** — bug fixes
3. **Changed** — modifications to existing behavior (non-breaking)
4. **Deprecated** — features that will be removed in a future major version
5. **Removed** — features removed in this version (MAJOR only)

---

## Pre-1.0

While Rialto is at `0.x.y`, minor versions may contain breaking changes. This is standard SemVer practice for initial development. Once the API stabilizes, the first stable release will be `1.0.0`.

---

## Release Checklist

- [ ] All changes committed and pushed
- [ ] `npm run build` passes
- [ ] CHANGELOG.md updated with new version section
- [ ] Version bumped in `package.json`
- [ ] Git tag created (`git tag v1.2.0`)
- [ ] Tag pushed (`git push --tags`)
