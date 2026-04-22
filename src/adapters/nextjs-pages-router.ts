// FILE PATH: src/adapters/nextjs-pages-router.ts
/**
 * Next.js Pages Router adapter.
 *
 * For each pages/api/**\/*.ts file, find the default export handler and
 * walk res.status(N).json(x) / res.json(x) calls to extract responses.
 *
 * Pages Router doesn't split by HTTP method at file level — handlers
 * branch on req.method. v1 extractor emits one operation per route under
 * POST by convention; the recorder corrects this with real method coverage.
 */

import {
  Node,
  SyntaxKind,
  type SourceFile,
  type CallExpression,
  type Expression,
  type Type,
  type ArrowFunction,
  type FunctionExpression,
  type FunctionDeclaration,
} from "ts-morph";
import type {
  AdapterResult,
  OpenAPIOperation,
  OpenAPIPathItem,
  OpenAPIResponse,
  OpenAPISchema,
  InputFile,
} from "../types.js";
import { buildProject } from "../lib/virtual-fs.js";
import { filePathToRoute, extractPathParams } from "../lib/route-path.js";
import { typeToSchema } from "../lib/type-to-schema.js";

type HandlerNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export function adaptNextjsPagesRouter(files: InputFile[]): AdapterResult {
  const project = buildProject(files);
  const paths: Record<string, OpenAPIPathItem> = {};
  const skipped: Array<{ path: string; reason: string }> = [];
  const warnings: string[] = [];
  let routeFilesFound = 0;
  let routesExtracted = 0;
  let routesWithTypedResponses = 0;

  warnings.push(
    "Pages Router handlers don't split by HTTP method at the file level. " +
    "Extractor emits one operation per route; install the recorder for " +
    "accurate per-method coverage.",
  );

  for (const file of files) {
    const route = filePathToRoute(file.path, "pages-router");
    if (!route) continue;
    routeFilesFound++;

    const source = project.getSourceFile("/" + file.path.replace(/^\.?\//, ""));
    if (!source) {
      skipped.push({ path: file.path, reason: "File could not be loaded into TS project" });
      continue;
    }

    const handler = findDefaultExportHandler(source);
    if (!handler) {
      skipped.push({ path: file.path, reason: "No default export handler found" });
      continue;
    }

    const responses = extractResponses(handler);
    if (Object.keys(responses).length === 0) {
      responses["200"] = { description: "OK" };
    }

    const operation: OpenAPIOperation = {
      operationId: buildOperationId(route),
      responses,
      "x-source-file": file.path,
      "x-confidence": anyTyped(responses) ? "medium" : "low",
    };

    const pathParams = extractPathParams(route);
    if (pathParams.length > 0) {
      operation.parameters = pathParams.map(name => ({
        name,
        in: "path" as const,
        required: true,
        schema: { type: "string" as const },
      }));
    }

    paths[route] = { post: operation };
    routesExtracted++;
    if (anyTyped(responses)) routesWithTypedResponses++;
  }

  return {
    paths,
    coverage: {
      routeFilesFound,
      routesExtracted,
      routesWithTypedResponses,
      skipped,
      warnings,
    },
  };
}

// ─── Default export discovery ───────────────────────────────────────────

function findDefaultExportHandler(source: SourceFile): HandlerNode | null {
  for (const fn of source.getFunctions()) {
    if (fn.isDefaultExport()) return fn;
  }

  const exportAssignment = source.getExportAssignment(d => !d.isExportEquals());
  if (exportAssignment) {
    const expr = exportAssignment.getExpression();
    if (Node.isArrowFunction(expr)) return expr;
    if (Node.isFunctionExpression(expr)) return expr;

    if (Node.isIdentifier(expr)) {
      const varDecl = source.getVariableDeclaration(expr.getText());
      if (varDecl) {
        const init = varDecl.getInitializer();
        if (init) {
          if (Node.isArrowFunction(init)) return init;
          if (Node.isFunctionExpression(init)) return init;
        }
      }
    }
  }

  return null;
}

// ─── Response extraction ────────────────────────────────────────────────

function extractResponses(handler: HandlerNode): Record<string, OpenAPIResponse> {
  const responses: Record<string, OpenAPIResponse> = {};
  const body = handler.getBody();
  if (!body) return responses;

  const calls = body.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => !isInsideNestedFunction(call, body));

  for (const call of calls) {
    const extracted = extractFromResCall(call);
    if (!extracted) continue;

    const { status, schema } = extracted;
    const key = String(status);
    if (responses[key]) continue;

    const response: OpenAPIResponse = {
      description: defaultStatusDescription(status),
    };
    if (schema) response.content = { "application/json": { schema } };
    responses[key] = response;
  }

  return responses;
}

function isInsideNestedFunction(call: Node, handlerBody: Node): boolean {
  let ancestor: Node | undefined = call.getParent();
  while (ancestor && ancestor !== handlerBody) {
    if (
      Node.isFunctionDeclaration(ancestor) ||
      Node.isArrowFunction(ancestor) ||
      Node.isFunctionExpression(ancestor) ||
      Node.isMethodDeclaration(ancestor)
    ) return true;
    ancestor = ancestor.getParent();
  }
  return false;
}

function extractFromResCall(
  call: CallExpression,
): { status: number; schema: OpenAPISchema | null } | null {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;

  const method = callee.getName();
  if (method !== "json" && method !== "send") return null;

  let status = 200;
  const object = callee.getExpression();
  if (Node.isCallExpression(object)) {
    const inner = object.getExpression();
    if (Node.isPropertyAccessExpression(inner) && inner.getName() === "status") {
      const statusArg = object.getArguments()[0];
      if (statusArg && Node.isNumericLiteral(statusArg)) {
        const parsed = Number(statusArg.getText());
        if (Number.isFinite(parsed) && parsed >= 100 && parsed < 600) status = parsed;
      }
    }
  }

  if (method !== "json") return { status, schema: null };

  const bodyArg = call.getArguments()[0];
  if (!bodyArg) return { status, schema: null };

  try {
    const type = (bodyArg as Expression).getType();
    return { status, schema: typeToSchema(type as Type) };
  } catch {
    return { status, schema: null };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function anyTyped(responses: Record<string, OpenAPIResponse>): boolean {
  return Object.values(responses).some(r =>
    r.content?.["application/json"]?.schema &&
    Object.keys(r.content["application/json"].schema).length > 0,
  );
}

function buildOperationId(route: string): string {
  const clean = route
    .replace(/[{}]/g, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_|_$/g, "");
  return `handle_${clean}`;
}

function defaultStatusDescription(status: number): string {
  const known: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 500: "Internal Server Error",
  };
  return known[status] ?? `Status ${status}`;
}
