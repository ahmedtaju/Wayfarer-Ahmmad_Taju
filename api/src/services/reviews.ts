import type { Database } from "../db/database";
import { AppError } from "../http/errors";
import type { ReviewInput } from "../http/validation";
import type { PlaceReview } from "./places";

export interface SavedReview {
  created: boolean;
  review: PlaceReview;
}

/** Keep existence checks, prior state, and the upsert in one write transaction. */
export async function saveReview(
  database: Database,
  placeId: number,
  userId: number,
  input: ReviewInput,
  now = new Date(),
): Promise<SavedReview> {
  const timestamp = now.toISOString();
  const results = await database.client.batch([
    { sql: "SELECT id, name FROM users WHERE id = ?", args: [userId] },
    { sql: "SELECT id FROM places WHERE id = ?", args: [placeId] },
    {
      sql: "SELECT id FROM reviews WHERE place_id = ? AND user_id = ?",
      args: [placeId, userId],
    },
    {
      // The SELECT produces no row when either referenced entity is absent,
      // allowing a useful 404 after the batch without a foreign-key failure.
      sql: `INSERT INTO reviews (place_id, user_id, rating, body, created_at, updated_at)
            SELECT p.id, u.id, ?, ?, ?, ?
            FROM places p JOIN users u ON u.id = ? WHERE p.id = ?
            ON CONFLICT (place_id, user_id) DO UPDATE SET
              rating = excluded.rating,
              body = excluded.body,
              updated_at = excluded.updated_at
            RETURNING id, rating, body, created_at, updated_at`,
      args: [input.rating, input.body, timestamp, timestamp, userId, placeId],
    },
  ], "write");

  const user = results[0].rows[0];
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (!results[1].rows[0]) throw new AppError(404, "PLACE_NOT_FOUND", "Place not found.");

  const row = results[3].rows[0];
  if (!row) throw new Error("Review upsert did not return a review.");

  return {
    created: results[2].rows.length === 0,
    review: {
      id: Number(row.id),
      rating: Number(row.rating),
      body: String(row.body),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      user: { id: Number(user.id), name: String(user.name) },
    },
  };
}
