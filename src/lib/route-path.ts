// FILE PATH: src/lib/route-path.ts
/**
 * Next.js file path → OpenAPI path pattern conversion.
 *
 * Examples:
 *   app/api/users/[id]/route.ts           → /api/users/{id}
 *   app/api/users/[id]/posts/route.ts     → /api/users/{id}/posts
 *   app/api/(admin)/users/route.ts        → /api/users                 (route group stripped)
 *   app/api/docs/[...slug]/route.ts       → /api/docs/{slug}           (catch-all)
 *   app/api/files/[[...path]]/route.ts    → /api/files/{path}          (optional catch-all)
 *   pages/api/users/[id].ts               → /api/users/{id}
 *   pages/api/users.ts                    → /api/users
 *   pages/api/users/index.ts              → /api/users
 */

export type RouteKind = "app-router" | "pages-router";

export function filePathToRoute(
  filePath: string,
  kind: RouteKind,
): string | null {
  let path = filePath.replace(/^\.?\//, "").replace(/\\/g, "/");

  if (kind === "app-router") {
    const match = path.match(/^(.*)\/route\.[^.]+$/);
    if (!match) return null;
    path = match[1]!;

    if (!path.startsWith("app/") && path !== "app") return null;
    path = path.slice(3);
    if (path === "") path = "/";
  } else {
    if (!path.startsWith("pages/api")) return null;
    path = path.slice("pages".length);
    path = path.replace(/\.[^./]+$/, "");
    path = path.replace(/\/index$/, "");
    if (path === "") path = "/";
  }

  const segments = path.split("/").map(toOpenApiSegment);
  const cleaned = segments
    .filter((s, i) => s !== null && (i === 0 || s !== ""))
    .join("/");

  return cleaned.startsWith("/") ? cleaned : "/" + cleaned;
}

function toOpenApiSegment(segment: string): string | null {
  if (/^\(.+\)$/.test(segment)) return "";
  if (/^@/.test(segment)) return "";

  const intercept = segment.match(/^\(\.+\)(.+)$/);
  if (intercept) return toOpenApiSegment(intercept[1]!);

  const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
  if (optionalCatchAll) return `{${optionalCatchAll[1]}}`;

  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
  if (catchAll) return `{${catchAll[1]}}`;

  const dynamic = segment.match(/^\[(.+)\]$/);
  if (dynamic) return `{${dynamic[1]}}`;

  return segment;
}

export function extractPathParams(openApiPath: string): string[] {
  const matches = openApiPath.match(/\{([^}]+)\}/g) ?? [];
  return matches.map(m => m.slice(1, -1));
}
