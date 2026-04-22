// FILE PATH: __tests__/integration.test.ts
//
// Tests use inline fixtures — the code being analyzed is defined as
// strings right here in the test file. This keeps the test self-
// contained: no separate fixtures directory, no fs.readdirSync, no
// path resolution gymnastics. The extractor takes {path, content}
// pairs anyway, so passing strings is the natural interface.

import { describe, it, expect } from "vitest";
import { extract } from "../src/index.js";

// ─── App Router fixture ─────────────────────────────────────────────────

const APP_ROUTER_FIXTURE = [
  {
    path: "app/api/posts/route.ts",
    content: `
import { NextResponse } from "next/server";

type Post = {
  id: string;
  title: string;
  published: boolean;
};

export async function GET() {
  const posts: Post[] = [];
  return NextResponse.json<Post[]>(posts);
}

export async function POST(req: Request) {
  const body = await req.json();
  const created: Post = {
    id: "p_123",
    title: body.title,
    published: false,
  };
  return NextResponse.json(created, { status: 201 });
}
`.trim(),
  },
  {
    path: "app/api/users/[id]/route.ts",
    content: `
import { NextResponse } from "next/server";

type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user: User = {
    id: params.id,
    email: "user@example.com",
    name: "Jane Doe",
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(user);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  void params;
  return NextResponse.json({ ok: true }, { status: 200 });
}
`.trim(),
  },
];

// ─── Pages Router fixture ───────────────────────────────────────────────

const PAGES_ROUTER_FIXTURE = [
  {
    path: "pages/api/users/[id].ts",
    content: `
import type { NextApiRequest, NextApiResponse } from "next";

type User = {
  id: string;
  email: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = req.query.id as string;

  if (req.method === "GET") {
    const user: User = { id, email: "u@example.com" };
    return res.status(200).json(user);
  }

  if (req.method === "DELETE") {
    return res.status(204).send(null);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
`.trim(),
  },
];

// ─── App Router tests ───────────────────────────────────────────────────

describe("Next.js App Router adapter", () => {
  const result = extract({
    files: APP_ROUTER_FIXTURE,
    options: { title: "Test API" },
  });

  it("detects the framework", () => {
    expect(result.coverage.framework).toBe("nextjs-app-router");
  });

  it("extracts both routes", () => {
    expect(Object.keys(result.spec.paths).sort()).toEqual([
      "/api/posts",
      "/api/users/{id}",
    ]);
  });

  it("finds all HTTP methods on each route", () => {
    expect(Object.keys(result.spec.paths["/api/posts"]!).sort()).toEqual(["get", "post"]);
    expect(Object.keys(result.spec.paths["/api/users/{id}"]!).sort()).toEqual(["delete", "get"]);
  });

  it("extracts path parameters", () => {
    const getUser = result.spec.paths["/api/users/{id}"]!.get!;
    expect(getUser.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
  });

  it("reports status codes correctly", () => {
    const createPost = result.spec.paths["/api/posts"]!.post!;
    expect(Object.keys(createPost.responses)).toContain("201");
  });

  it("extracts a response schema for typed routes", () => {
    const getUser = result.spec.paths["/api/users/{id}"]!.get!;
    const schema = getUser.responses["200"]?.content?.["application/json"]?.schema;
    expect(schema?.type).toBe("object");
    expect(schema?.properties?.id?.type).toBe("string");
    expect(schema?.properties?.email?.type).toBe("string");
  });

  it("produces deterministic output", () => {
    const again = extract({
      files: APP_ROUTER_FIXTURE,
      options: { title: "Test API" },
    });
    const strip = (r: typeof result) => {
      const copy = JSON.parse(JSON.stringify(r.spec));
      delete copy.info["x-generated-at"];
      return copy;
    };
    expect(strip(result)).toEqual(strip(again));
  });

  it("reports meaningful coverage", () => {
    expect(result.coverage.routeFilesFound).toBe(2);
    expect(result.coverage.routesExtracted).toBeGreaterThan(0);
    expect(result.coverage.routesWithTypedResponses).toBeGreaterThan(0);
  });
});

// ─── Pages Router tests ─────────────────────────────────────────────────

describe("Next.js Pages Router adapter", () => {
  const result = extract({ files: PAGES_ROUTER_FIXTURE });

  it("detects the framework", () => {
    expect(result.coverage.framework).toBe("nextjs-pages-router");
  });

  it("extracts the route", () => {
    expect(Object.keys(result.spec.paths)).toContain("/api/users/{id}");
  });

  it("surfaces the method-branching warning", () => {
    expect(result.coverage.warnings.some(w => w.includes("don't split by HTTP method"))).toBe(true);
  });
});

// ─── Unknown framework ──────────────────────────────────────────────────

describe("Unknown framework", () => {
  it("returns empty spec with informative warning", () => {
    const result = extract({
      files: [{ path: "random/file.ts", content: "const x = 1;" }],
    });
    expect(result.coverage.framework).toBe("unknown");
    expect(Object.keys(result.spec.paths).length).toBe(0);
    expect(result.coverage.warnings[0]).toMatch(/No framework detected/);
  });
});
