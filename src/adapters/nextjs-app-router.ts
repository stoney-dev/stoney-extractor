// FILE PATH: src/adapters/nextjs-app-router.ts
/**
 * Next.js App Router adapter.
 *
 * For each app/**\/route.ts file:
 *   1. Convert the file path to an OpenAPI path (e.g. "/api/users/{id}")
 *   2. Find exported functions named GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
 *   3. For each export, find the return expressions and try to extract the
 *      response type from NextResponse.json<T>(...) or Response.json(...)
 *   4. Emit an OpenAPI Operation with responses keyed by status code
 */

import {
  Node,
  SyntaxKind,
  type SourceFile,
  type FunctionDeclaration,
  type ArrowFunction,
  type FunctionExpression,
  type CallExpression,
  type Expression,
  type Type,
} from "ts-morph";
import type {
  AdapterResult,
  HttpMethod,
  OpenAPIOperation,
  OpenAPIPathItem,
  OpenAPIResponse,
  OpenAPISchema,
  InputFile,
} from "../types.js";
import { buildProject } from "../lib/virtual-fs.js";
import { filePathToRoute, extractPathParams } from "../lib/route-path.js";
import { typeToSchema } from "../lib/type-to-schema.js";

const HTTP_METHODS: readonly HttpMethod[] = [
  "get", "post", "put", "patch", "delete", "options", "head",
] as const;

const METHOD_EXPORT_NAMES = HTTP_METHODS.map(m => m.toUpperCase());

type HandlerNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export function adaptNextjsAppRouter(files: InputFile[]): AdapterResult {
  const project = buildProject(files);
  const paths: Record<string, OpenAPIPathItem> = {};
  const skipped: Array<{ path: string; reason: string }> = [];
  const warnings: string[] = [];
  let routeFilesFound = 0;
  let routesExtracted = 0;
  let routesWithTypedResponses = 0;

  for (const file of files) {
    const route = filePathToRoute(file.path, "app-router");
    if (!route) continue;
    routeFilesFound++;

    const source = project.getSourceFile("/" + file.path.replace(/^\.?\//, ""));
    if (!source) {
      skipped.push({ path: file.path, reason: "File could not be loaded into TS project" });
      continue;
    }

    const pathItem: OpenAPIPathItem = {};

    for (const exportName of METHOD_EXPORT_NAMES) {
      const handler = findExportedHandler(source, exportName);
      if (!handler) continue;

      const method = exportName.toLowerCase() as HttpMethod;
      const operation = buildOperation(handler, file.path, route);
      pathItem[method] = operation;
      routesExtracted++;

      const has200 = operation.responses["200"];
      if (
        has200?.content?.["application/json"]?.schema &&
        Object.keys(has200.content["application/json"].schema).length > 0
      ) {
        routesWithTypedResponses++;
      }
    }

    if (Object.keys(pathItem).length > 0) {
      paths[route] = pathItem;
    } else {
      skipped.push({
        path: file.path,
        reason: "No exported HTTP method functions found (GET/POST/etc.)",
      });
    }
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

// ─── Export discovery ───────────────────────────────────────────────────

function findExportedHandler(
  source: SourceFile,
  exportName: string,
): HandlerNode | null {
  const fnDecl = source.getFunction(exportName);
  if (fnDecl && fnDecl.isExported()) return fnDecl;

  const varDecl = source.getVariableDeclaration(exportName);
  if (varDecl) {
    const parent = varDecl.getVariableStatement();
    if (!parent?.isExported()) return null;
    const init = varDecl.getInitializer();
    if (!init) return null;
    if (Node.isArrowFunction(init)) return init;
    if (Node.isFunctionExpression(init)) return init;
  }

  return null;
}

// ─── Operation construction ─────────────────────────────────────────────

function buildOperation(
  handler: HandlerNode,
  filePath: string,
  route: string,
): OpenAPIOperation {
  const responses = extractResponses(handler);

  if (Object.keys(responses).length === 0) {
    responses["200"] = { description: "Successful response" };
  }

  const operation: OpenAPIOperation = {
    operationId: buildOperationId(getHandlerName(handler), route),
    responses,
    "x-source-file": filePath,
    "x-confidence": anyTyped(responses) ? "high" : "low",
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

  return operation;
}

function getHandlerName(handler: HandlerNode): string {
  if (Node.isFunctionDeclaration(handler)) return handler.getName() ?? "handler";
  const parent = handler.getParent();
  if (Node.isVariableDeclaration(parent)) return parent.getName();
  return "handler";
}

function buildOperationId(name: string, route: string): string {
  const clean = route
    .replace(/[{}]/g, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${name.toLowerCase()}_${clean}` || name.toLowerCase();
}

function anyTyped(responses: Record<string, OpenAPIResponse>): boolean {
  return Object.values(responses).some(r =>
    r.content?.["application/json"]?.schema &&
    Object.keys(r.content["application/json"].schema).length > 0,
  );
}

// ─── Response extraction ────────────────────────────────────────────────

function extractResponses(handler: HandlerNode): Record<string, OpenAPIResponse> {
  const responses: Record<string, OpenAPIResponse> = {};
  const body = handler.getBody();
  if (!body) return responses;

  const returnStatements = body.getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter(ret => {
      let ancestor: Node | undefined = ret.getParent();
      while (ancestor && ancestor !== body) {
        if (
          Node.isFunctionDeclaration(ancestor) ||
          Node.isArrowFunction(ancestor) ||
          Node.isFunctionExpression(ancestor) ||
          Node.isMethodDeclaration(ancestor)
        ) return false;
        ancestor = ancestor.getParent();
      }
      return true;
    });

  for (const ret of returnStatements) {
    const expr = ret.getExpression();
    if (!expr) continue;
    const extracted = extractResponseFromExpression(expr);
    if (!extracted) continue;

    const { status, schema } = extracted;
    const key = String(status);
    if (responses[key]) continue;

    const response: OpenAPIResponse = {
      description: defaultStatusDescription(status),
    };
    if (schema) {
      response.content = { "application/json": { schema } };
    }
    responses[key] = response;
  }

  return responses;
}

function extractResponseFromExpression(
  expr: Expression,
): { status: number; schema: OpenAPISchema | null } | null {
  let current: Node = expr;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isTypeAssertion(current) ||
    Node.isSatisfiesExpression(current)
  ) {
    current = (current as unknown as { getExpression(): Expression }).getExpression();
  }

  if (Node.isAwaitExpression(current)) {
    current = current.getExpression();
  }

  if (!Node.isCallExpression(current)) return null;

  const callee = current.getExpression();
  const calleeText = callee.getText();

  const isJsonCall =
    /^(NextResponse|Response)\.json$/.test(calleeText) ||
    /\.json$/.test(calleeText);

  const isConstructorCall =
    calleeText === "NextResponse" || calleeText === "Response" ||
    /^new (NextResponse|Response)$/.test(calleeText);

  if (!isJsonCall && !isConstructorCall) return null;

  const status = extractStatusFromCall(current);
  const schema = isJsonCall ? extractBodyTypeFromCall(current) : null;

  return { status, schema };
}

function extractStatusFromCall(call: CallExpression): number {
  const args = call.getArguments();
  const initArg = args[1];
  if (!initArg || !Node.isObjectLiteralExpression(initArg)) return 200;

  for (const prop of initArg.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    if (prop.getName() !== "status") continue;
    const value = prop.getInitializer();
    if (!value) continue;
    if (Node.isNumericLiteral(value)) {
      const parsed = Number(value.getText());
      if (Number.isFinite(parsed) && parsed >= 100 && parsed < 600) return parsed;
    }
  }

  return 200;
}

function extractBodyTypeFromCall(call: CallExpression): OpenAPISchema | null {
  const typeArgs = call.getTypeArguments();
  if (typeArgs.length > 0) {
    try {
      const type = typeArgs[0]!.getType();
      const schema = typeToSchema(type);
      if (schema) return schema;
    } catch {
      // fall through
    }
  }

  const args = call.getArguments();
  const bodyArg = args[0];
  if (!bodyArg) return null;

  try {
    const type = bodyArg.getType();
    return typeToSchema(type as Type);
  } catch {
    return null;
  }
}

function defaultStatusDescription(status: number): string {
  const known: Record<number, string> = {
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };
  return known[status] ?? `Status ${status}`;
}
