// FILE PATH: src/lib/virtual-fs.ts
/**
 * In-memory ts-morph project construction.
 *
 * The extractor accepts files as in-memory strings — it never reads from
 * disk. ts-morph supports this by letting you add source files by path
 * and content via project.createSourceFile(), which stores them in a
 * virtual filesystem.
 */

import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind } from "ts-morph";
import type { InputFile } from "../types.js";

export function buildProject(files: InputFile[]): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      jsx: 4 /* Preserve */,
      strict: false,
      allowJs: true,
      resolveJsonModule: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
    },
  });

  for (const file of files) {
    const normalized = normalizePath(file.path);
    try {
      project.createSourceFile(normalized, file.content, { overwrite: true });
    } catch {
      // If ts-morph rejects the file (e.g. invalid syntax), skip silently.
      // Adapters will report it via coverage.skipped.
    }
  }

  return project;
}

function normalizePath(path: string): string {
  const stripped = path.replace(/\\/g, "/").replace(/^\.?\//, "");
  return "/" + stripped;
}
