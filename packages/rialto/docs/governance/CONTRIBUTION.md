# Contribution Lifecycle

How components move from idea to shared library.

---

## Stages

```
Proposal → Experimental → Review → Canonical
```

### 1. Proposal

A product team identifies a need that isn't met by existing components.

**Requirements:**

- Description of the use case
- Which existing components were considered and why they don't fit
- Rough sketch or wireframe (optional but encouraged)

**Outcome:** The proposal is logged as a GitHub issue with the `component-proposal` label.

### 2. Experimental

The component is built for the specific use case that motivated it.

**Rules:**

- Lives in the consuming project, not in `@rialto/components`
- Must follow Rialto token usage (no hardcoded colors, spacing, or radii)
- Must use `forwardRef` and CSS Modules
- May have a narrower API than what the canonical version will need

**Duration:** One product cycle (typically 2-4 weeks of real usage).

### 3. Review

The core team reviews the experimental component against Rialto standards.

**Checklist:**

- [ ] Follows all patterns in `CLAUDE.md` (tokens, forwardRef, displayName, CSS Modules)
- [ ] Keyboard accessible with gold focus ring (`--rialto-shadow-focus`)
- [ ] Meets WCAG 2.2 AA (contrast, target size, focus visible)
- [ ] Reduced motion support (`prefers-reduced-motion`)
- [ ] Props API uses standard conventions (`variant`, `size`, `disabled`)
- [ ] Has at least one realistic usage example
- [ ] No hardcoded values — all visual properties from tokens

**Outcome:** Approved, approved with changes, or returned to experimental.

### 4. Canonical

The component is promoted to `src/components/` in the shared library.

**Requirements:**

- Passes the full review checklist
- Added to the showcase app with representative examples
- Exported from the package index

---

## Quick Reference

| Stage        | Where it lives       | Who owns it  | Token compliance |
| ------------ | -------------------- | ------------ | ---------------- |
| Proposal     | GitHub issue         | Product team | N/A              |
| Experimental | Consuming project    | Product team | Required         |
| Review       | PR to shared library | Core team    | Verified         |
| Canonical    | `src/components/`    | Core team    | Enforced         |
