// FILE PATH: src/adapters/index.ts
/**
 * Adapter registry.
 * Maps framework identifiers to the function that handles them.
 */

import type { AdapterResult, Framework, InputFile } from "../types.js";
import { adaptNextjsAppRouter } from "./nextjs-app-router.js";
import { adaptNextjsPagesRouter } from "./nextjs-pages-router.js";

export type AdapterFn = (files: InputFile[]) => AdapterResult;

export const ADAPTERS: Record<Exclude<Framework, "unknown">, AdapterFn> = {
  "nextjs-app-router": adaptNextjsAppRouter,
  "nextjs-pages-router": adaptNextjsPagesRouter,
};

export function getAdapter(framework: Framework): AdapterFn | null {
  if (framework === "unknown") return null;
  return ADAPTERS[framework] ?? null;
}