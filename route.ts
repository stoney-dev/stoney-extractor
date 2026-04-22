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
