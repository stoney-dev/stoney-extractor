// FILE PATH: src/types.ts
/**
 * Public types for @stoney-dev/extractor.
 *
 * The extractor is a pure function: in-memory files in, OpenAPI 3.1 out.
 * It never touches the network, filesystem, or environment variables.
 */

// ─── Input ───────────────────────────────────────────────────────────────

export type InputFile = {
  /** Path relative to the repo root. Used for framework detection and route
   *  path inference. Forward slashes only — no leading "./". */
  path: string;
  /** UTF-8 file contents. */
  content: string;
};

export type ExtractOptions = {
  /** Force a specific framework. Skips auto-detection. */
  framework?: Framework;
  /** Title for the generated OpenAPI spec. Default: "API". */
  title?: string;
  /** Base path to strip from detected routes. Useful for monorepos where the
   *  API lives under a subdirectory. Default: "" (no strip). */
  basePath?: string;
};

export type ExtractInput = {
  files: InputFile[];
  options?: ExtractOptions;
};

// ─── Framework identity ──────────────────────────────────────────────────

export type Framework =
  | "nextjs-app-router"
  | "nextjs-pages-router"
  | "unknown";

// ─── Output ──────────────────────────────────────────────────────────────

export type OpenAPIDocument = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description?: string;
    "x-generated-by"?: string;
    "x-generated-at"?: string;
    "x-extractor-version"?: string;
  };
  paths: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
  };
};

export type OpenAPIPathItem = Partial<Record<HttpMethod, OpenAPIOperation>>;

export type HttpMethod =
  | "get" | "post" | "put" | "patch" | "delete" | "options" | "head";

export type OpenAPIOperation = {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  responses: Record<string, OpenAPIResponse>;
  "x-source-file"?: string;
  "x-confidence"?: "high" | "medium" | "low";
};

export type OpenAPIParameter = {
  name: string;
  in: "query" | "path" | "header";
  required?: boolean;
  schema?: OpenAPISchema;
};

export type OpenAPIResponse = {
  description: string;
  content?: Record<string, { schema?: OpenAPISchema }>;
};

export type OpenAPISchema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  format?: string;
  nullable?: boolean;
  enum?: Array<string | number | boolean | null>;
  additionalProperties?: boolean | OpenAPISchema;
  description?: string;
};

// ─── Coverage ────────────────────────────────────────────────────────────

export type CoverageReport = {
  framework: Framework;
  routeFilesFound: number;
  routesExtracted: number;
  routesWithTypedResponses: number;
  skipped: Array<{ path: string; reason: string }>;
  warnings: string[];
};

export type ExtractResult = {
  spec: OpenAPIDocument;
  coverage: CoverageReport;
};

// ─── Internal adapter contract ───────────────────────────────────────────

export type AdapterResult = {
  paths: Record<string, OpenAPIPathItem>;
  coverage: Omit<CoverageReport, "framework">;
};
