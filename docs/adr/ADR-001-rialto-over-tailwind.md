---
id: ADR-001
title: Design System Unification (Rialto over Tailwind)
status: active
date: 2026-03-28
prohibited_patterns:
  - '\b(flex|grid|mt-|p-|text-)\b.*className='
  - 'className=.*\b(flex|grid|mt-|p-|text-)\b'
---

# ADR-001: Design System Unification (Rialto over Tailwind)

## Context
The project initially used Tailwind CSS for rapid prototyping. However, as the codebase grew, we developed **Rialto**, a custom design system based on CSS Modules and design tokens. Maintaining two different styling paradigms created inconsistency and larger bundle sizes.

## Decision
We will use `@mbe/rialto` components and CSS Modules for all styling. Tailwind CSS is prohibited.

## Rationale
- **Consistency:** A single styling source of truth.
- **Agent Efficiency:** AI agents perform better when given a strict, singular pattern (CSS Modules) rather than being allowed to choose between two systems.
- **Maintainability:** Easier to audit and update design tokens across the entire monorepo.

## Prohibited Patterns
Any Tailwind utility classes used within `className` attributes in TSX/JSX files are strictly forbidden.
