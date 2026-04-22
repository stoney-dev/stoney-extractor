// FILE PATH: src/index.ts
/**
 * @stoney-dev/extractor — public API.
 *
 * One function, `extract(input)`:
 *   - Takes an array of in-memory files (path + content)
 *   - Detects the framework (or uses options.framework if provided)
 *   - Runs the matching adapter
 *   - Returns { spec, coverage }
 *
 * Pure function. No I/O. No network. No environment variables.
 */

import { buildOpenAPIDocument } from "./lib/openapi-builder.js";
import { detectFramework, filterRelevantFiles } from "./detect.js";
import type { ExtractInput, ExtractResult, Framework } from "./types.js";
import { getAdapter } from "./adapters/index.js";

export function extract(input: ExtractInput): ExtractResult {
  const { files, options = {} } = input;

  const framework: Framework = options.framework ?? detectFramework(files);
  const relevantFiles = filterRelevantFiles(files, framework);
  const adapter = getAdapter(framework);

  if (!adapter) {
    return {
      spec: buildOpenAPIDocument({}, { framework: "unknown", title: options.title }),
      coverage: {
        framework: "unknown",
        routeFilesFound: 0,
        routesExtracted: 0,
        routesWithTypedResponses: 0,
        skipped: [],
        warnings: [
          "No framework detected. Supported: Next.js App Router, Next.js Pages Router. " +
          "Pass options.framework to force detection, or open an issue for other frameworks.",
        ],
      },
    };
  }

  const { paths, coverage } = adapter(relevantFiles);
  const spec = buildOpenAPIDocument(paths, { framework, title: options.title });

  return { spec, coverage: { framework, ...coverage } };
}

// ─── Public type re-exports ─────────────────────────────────────────────

export type {
  ExtractInput,
  ExtractOptions,
  ExtractResult,
  CoverageReport,
  OpenAPIDocument,
  OpenAPIPathItem,
  OpenAPIOperation,
  OpenAPIResponse,
  OpenAPISchema,
  OpenAPIParameter,
  HttpMethod,
  Framework,
  InputFile,
} from "./types.js";
