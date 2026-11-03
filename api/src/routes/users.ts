import { Router } from "express";
import type { Database } from "../db/database";
import { asyncHandler } from "../http/errors";

export function usersRouter(database: Database): Router {
  const router = Router();
  router.get("/", asyncHandler(async (_req, res) => {
    const result = await database.client.execute("SELECT id, name FROM users ORDER BY id ASC");
    res.json({ data: result.rows.map((row) => ({ id: Number(row.id), name: String(row.name) })) });
  }));
  return router;
}
