// FILE PATH: src/detect.ts
/**
 * Framework detection from file path inspection only.
 * Deterministic — doesn't read any file contents.
 */

import type { Framework, InputFile } from "./types.js";

const APP_ROUTER_FILE = /(^|\/)app\/.+\/route\.(ts|tsx|js|mjs|jsx)$/;
const PAGES_ROUTER_FILE = /(^|\/)pages\/api\/.+\.(ts|tsx|js|mjs|jsx)$/;

export function detectFramework(files: InputFile[]): Framework {
  let hasAppRouter = false;
  let hasPagesRouter = false;

  for (const f of files) {
    const path = f.path.replace(/^\.?\//, "");
    if (APP_ROUTER_FILE.test(path)) hasAppRouter = true;
    else if (PAGES_ROUTER_FILE.test(path)) hasPagesRouter = true;
    if (hasAppRouter) break;
  }

  if (hasAppRouter) return "nextjs-app-router";
  if (hasPagesRouter) return "nextjs-pages-router";
  return "unknown";
}

export function filterRelevantFiles(
  files: InputFile[],
  framework: Framework,
): InputFile[] {
  switch (framework) {
    case "nextjs-app-router":
      return files.filter(f => APP_ROUTER_FILE.test(f.path.replace(/^\.?\//, "")));
    case "nextjs-pages-router":
      return files.filter(f => PAGES_ROUTER_FILE.test(f.path.replace(/^\.?\//, "")));
    case "unknown":
      return [];
  }
}
