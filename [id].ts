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
