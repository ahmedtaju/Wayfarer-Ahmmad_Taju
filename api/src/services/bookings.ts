import type { Database } from "../db/database";
import { AppError } from "../http/errors";
import type { BookingInput } from "../http/validation";

export interface Booking {
  id: number;
  slotId: number;
  userId: number;
  seats: number;
  createdAt: string;
}

/** Acquire the SQLite write lock before checking capacity and inserting seats. */
export async function reserveSeats(
  database: Database,
  slotId: number,
  userId: number,
  input: BookingInput,
  now = new Date(),
): Promise<Booking> {
  const timestamp = now.toISOString();
  // The local driver's write batch starts BEGIN IMMEDIATE. A competing writer
  // waits before reading bookings, and the batch resolves only after commit.
  const results = await database.client.batch([
    { sql: "SELECT id FROM users WHERE id = ?", args: [userId] },
    { sql: "SELECT id FROM tour_slots WHERE id = ?", args: [slotId] },
    {
      sql: `INSERT INTO bookings (slot_id, user_id, seats, created_at)
            SELECT s.id, u.id, ?, ?
            FROM tour_slots s JOIN users u ON u.id = ?
            WHERE s.id = ?
              AND s.capacity - COALESCE((
                SELECT SUM(b.seats) FROM bookings b WHERE b.slot_id = s.id
              ), 0) >= ?
            RETURNING id, slot_id, user_id, seats, created_at`,
      args: [input.seats, timestamp, userId, slotId, input.seats],
    },
  ], "write");

  if (!results[0].rows[0]) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (!results[1].rows[0]) throw new AppError(404, "SLOT_NOT_FOUND", "Tour slot not found.");

  const row = results[2].rows[0];
  if (!row) {
    throw new AppError(409, "INSUFFICIENT_CAPACITY", "Not enough seats remain for this booking.");
  }

  return {
    id: Number(row.id),
    slotId: Number(row.slot_id),
    userId: Number(row.user_id),
    seats: Number(row.seats),
    createdAt: String(row.created_at),
  };
}
