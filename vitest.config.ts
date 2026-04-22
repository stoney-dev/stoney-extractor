// FILE PATH: vitest.config.ts (at repo root)
//
// Vitest uses Vite for module resolution. Because our source is TypeScript
// but our imports use ".js" extensions (for compiled ESM compatibility),
// we tell Vite to resolve ".js" imports to the corresponding ".ts" file
// when running tests directly from source.
//
// Without this, vitest tries to find literal `index.js` files next to
// the `.ts` sources and fails.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
});
