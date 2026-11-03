import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCK_TIMEOUT_MS, openDatabase, resolveDatabasePath, type Database } from "../db/database";
import { initializeDatabase } from "../db/schema";
import { createTestDirectory } from "./helpers/database";

describe("SQLite model and connection integrity", () => {
  let directory: string;
  let database: Database;

  beforeEach(async () => {
    directory = await createTestDirectory("model-");
    database = await openDatabase({ path: join(directory, "test.sqlite") });
    await initializeDatabase(database);
    await database.client.batch([
      "INSERT INTO users (id, name) VALUES (1, 'Sara'), (2, 'Abel')",
      `INSERT INTO places (id, name, category, description, opening_hours)
       VALUES (1, 'Museum', 'History', 'A city museum.', '09:00–17:00')`,
      "INSERT INTO tour_slots (id, place_id, starts_at, capacity) VALUES (1, 1, '2030-01-01T06:00:00.000Z', 10)",
    ], "write");
  });

  afterEach(() => {
    database?.close();
  });

  it("enforces foreign keys and the lock timeout on each independently opened connection", async () => {
    const other = await openDatabase({ path: database.path });
    try {
      for (const connection of [database, other]) {
        expect((await connection.client.execute("PRAGMA foreign_keys")).rows[0].foreign_keys).toBe(1);
        expect((await connection.client.execute("PRAGMA busy_timeout")).rows[0].timeout).toBe(LOCK_TIMEOUT_MS);
        await expect(connection.client.execute(`INSERT INTO bookings (slot_id, user_id, seats, created_at)
          VALUES (999, 1, 1, '2030-01-01T00:00:00.000Z')`)).rejects.toThrow(/FOREIGN KEY/);
      }
    } finally {
      other.close();
    }
  });

  it("keeps relative database paths anchored to api rather than the working directory", () => {
    expect(resolveDatabasePath("data/example.sqlite")).toBe(resolve(__dirname, "../../data/example.sqlite"));
    expect(resolveDatabasePath(database.path)).toBe(database.path);
    expect(() => resolveDatabasePath(" ")).toThrow(/nonempty/);
  });

  it("allows only one review per user/place while other travellers can review it", async () => {
    const sql = `INSERT INTO reviews (place_id, user_id, rating, body, created_at, updated_at)
      VALUES (1, ?, 5, 'A useful review.', '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')`;
    await database.client.execute({ sql, args: [1] });
    await expect(database.client.execute({ sql, args: [1] })).rejects.toThrow(/UNIQUE/);
    await database.client.execute({ sql, args: [2] });
    expect((await database.client.execute("SELECT COUNT(*) AS count FROM reviews")).rows[0].count).toBe(2);
  });

  it.each([
    "INSERT INTO reviews (place_id,user_id,rating,body,created_at,updated_at) VALUES (99,1,5,'Text','now','now')",
    "INSERT INTO reviews (place_id,user_id,rating,body,created_at,updated_at) VALUES (1,99,5,'Text','now','now')",
    "INSERT INTO tour_slots (place_id,starts_at,capacity) VALUES (99,'now',10)",
    "INSERT INTO bookings (slot_id,user_id,seats,created_at) VALUES (99,1,1,'now')",
    "INSERT INTO bookings (slot_id,user_id,seats,created_at) VALUES (1,99,1,'now')",
    "DELETE FROM places WHERE id = 1",
  ])("rejects broken relationships (%s)", async (sql) => {
    await expect(database.client.execute(sql)).rejects.toThrow(/FOREIGN KEY/);
  });

  it.each([0, 6, -1, 3.5])("rejects invalid stored ratings (%s)", async (rating) => {
    await expect(database.client.execute({
      sql: `INSERT INTO reviews (place_id,user_id,rating,body,created_at,updated_at)
        VALUES (1,1,?,'Text','now','now')`, args: [rating],
    })).rejects.toThrow();
  });

  it.each([0, -1, 1.5, 9007199254740992])("rejects invalid seat quantities and capacities (%s)", async (quantity) => {
    await expect(database.client.execute({
      sql: "INSERT INTO bookings (slot_id,user_id,seats,created_at) VALUES (1,1,?,'now')", args: [quantity],
    })).rejects.toThrow();
    await expect(database.client.execute({
      sql: "INSERT INTO tour_slots (place_id,starts_at,capacity) VALUES (1,'now',?)", args: [quantity],
    })).rejects.toThrow();
  });

  it("derives rating statistics and seat totals from records without duplicate counters", async () => {
    const placeColumns = await database.client.execute("PRAGMA table_info(places)");
    const slotColumns = await database.client.execute("PRAGMA table_info(tour_slots)");
    expect(placeColumns.rows.map((row) => row.name)).not.toContain("review_count");
    expect(slotColumns.rows.map((row) => row.name)).not.toContain("booked_seats");
    await database.client.execute("INSERT INTO bookings (slot_id,user_id,seats,created_at) VALUES (1,1,3,'now')");
    const result = await database.client.execute(`SELECT s.capacity - COALESCE(SUM(b.seats),0) AS remaining
      FROM tour_slots s LEFT JOIN bookings b ON s.id=b.slot_id WHERE s.id=1 GROUP BY s.id`);
    expect(result.rows[0].remaining).toBe(7);
  });
});
