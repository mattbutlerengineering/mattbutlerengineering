# Config

Shared configuration presets for ESLint, TypeScript, and Prettier used across the monorepo.

## Usage

### TypeScript

```json
// tsconfig.json
{ "extends": "@mbe/config/typescript/base" }
// or: @mbe/config/typescript/react, @mbe/config/typescript/node
```

### ESLint

```javascript
// eslint.config.js
import base from "@mbe/config/eslint/base";
export default [...base];
// or: @mbe/config/eslint/react, @mbe/config/eslint/node
```

### Prettier

```javascript
// prettier.config.js
export { default } from "@mbe/config/prettier";
```

## Presets

| Preset | Use Case |
|--------|----------|
| `typescript/base` | Shared packages and libraries |
| `typescript/react` | React frontend apps |
| `typescript/node` | Node.js backend services |
| `eslint/base` | Base linting rules |
| `eslint/react` | React-specific rules (JSX a11y, hooks) |
| `eslint/node` | Node.js-specific rules |
| `prettier` | Formatting (double quotes, semicolons, 2-space indent) |
