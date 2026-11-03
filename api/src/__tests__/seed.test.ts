import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../db/database";
import { initializeDatabase } from "../db/schema";
import { seedDatabase } from "../db/seed";
import { createTestDirectory } from "./helpers/database";

const seedTime = new Date("2030-06-15T23:45:00.000Z");

describe("explicit demo database seeding", () => {
  let directory: string;
  let database: Database;

  beforeEach(async () => {
    directory = await createTestDirectory("seed-");
    database = await openDatabase({ path: join(directory, "test.sqlite") });
    await initializeDatabase(database);
  });

  afterEach(() => {
    database?.close();
  });

  it("creates consistent travellers, places, reviews, and future tour availability", async () => {
    await seedDatabase(database, seedTime);

    const users = await database.client.execute("SELECT name FROM users ORDER BY id");
    expect(users.rows.map((row) => row.name)).toEqual(["Sara", "Abel", "Liya"]);

    const places = await database.client.execute(`
      SELECT p.id, p.name, p.category, COUNT(r.id) AS review_count, AVG(r.rating) AS average_rating
      FROM places p LEFT JOIN reviews r ON r.place_id = p.id GROUP BY p.id ORDER BY p.id
    `);
    expect(places.rows).toHaveLength(10);
    expect(new Set(places.rows.map((place) => place.category))).toEqual(new Set(["History", "Food", "Nature"]));
    expect(places.rows.every((place) => Number(place.review_count) > 0 && Number(place.review_count) <= 3)).toBe(true);
    expect(places.rows[0]).toMatchObject({ review_count: 3, average_rating: 14 / 3 });
    expect(places.rows[1]).toMatchObject({ review_count: 1, average_rating: 5 });

    const museumReviews = await database.client.execute("SELECT rating FROM reviews WHERE place_id = 1 ORDER BY id");
    expect(museumReviews.rows.map((review) => review.rating)).toEqual([5, 5, 4]);
    const duplicates = await database.client.execute(`
      SELECT place_id, user_id FROM reviews GROUP BY place_id, user_id HAVING COUNT(*) > 1
    `);
    expect(duplicates.rows).toHaveLength(0);

    const slots = await database.client.execute(`
      SELECT s.id, s.starts_at, s.capacity, COALESCE(SUM(b.seats), 0) AS booked_seats,
             s.capacity - COALESCE(SUM(b.seats), 0) AS available_seats
      FROM tour_slots s LEFT JOIN bookings b ON b.slot_id = s.id GROUP BY s.id ORDER BY s.id
    `);
    expect(slots.rows).toHaveLength(5);
    expect(slots.rows.map((slot) => slot.available_seats)).toEqual([4, 1, 0, 8, 6]);
    for (const slot of slots.rows) {
      expect(new Date(String(slot.starts_at)).getTime()).toBeGreaterThan(seedTime.getTime());
      expect(Number(slot.booked_seats)).toBeLessThanOrEqual(Number(slot.capacity));
    }
    const withoutTours = await database.client.execute(`
      SELECT p.id FROM places p WHERE NOT EXISTS (SELECT 1 FROM tour_slots s WHERE s.place_id = p.id)
    `);
    expect(withoutTours.rows.length).toBeGreaterThan(0);
    const totals = await database.client.execute("SELECT COUNT(*) AS count, SUM(seats) AS seats FROM bookings");
    expect(totals.rows[0]).toMatchObject({ count: 7, seats: 29 });
    const foreignKeyErrors = await database.client.execute("PRAGMA foreign_key_check");
    expect(foreignKeyErrors.rows).toHaveLength(0);
  });

  it("deliberately resets user changes and restores the same fixtures when run again", async () => {
    await seedDatabase(database, seedTime);
    const original = await database.client.execute("SELECT * FROM reviews ORDER BY id");
    await database.client.execute("UPDATE reviews SET rating = 1, body = 'Changed during demo' WHERE id = 1");
    await database.client.execute({
      sql: "INSERT INTO bookings (id, slot_id, user_id, seats, created_at) VALUES (99, 5, 1, 1, ?)",
      args: [seedTime.toISOString()],
    });
    await database.client.execute("INSERT INTO users (id, name) VALUES (99, 'Temporary traveller')");

    await seedDatabase(database, seedTime);

    const restored = await database.client.execute("SELECT * FROM reviews ORDER BY id");
    expect(restored.rows).toEqual(original.rows);
    const users = await database.client.execute("SELECT COUNT(*) AS count FROM users");
    expect(users.rows[0].count).toBe(3);
    const bookings = await database.client.execute("SELECT COUNT(*) AS count, SUM(seats) AS seats FROM bookings");
    expect(bookings.rows[0]).toMatchObject({ count: 7, seats: 29 });
  });

  it("does not replace persisted demo changes when the database is reopened or initialized", async () => {
    await seedDatabase(database, seedTime);
    await database.client.execute("UPDATE reviews SET rating = 2, body = 'Saved traveller review' WHERE id = 1");
    database.close();

    database = await openDatabase({ path: join(directory, "test.sqlite") });
    await initializeDatabase(database);

    const review = await database.client.execute("SELECT rating, body FROM reviews WHERE id = 1");
    expect(review.rows[0]).toMatchObject({ rating: 2, body: "Saved traveller review" });
    const bookings = await database.client.execute("SELECT SUM(seats) AS seats FROM bookings");
    expect(bookings.rows[0].seats).toBe(29);
  });

  it("rolls back the whole reset if fixture insertion fails", async () => {
    await seedDatabase(database, seedTime);
    await database.client.execute("UPDATE reviews SET body = 'Keep this review on failed reset' WHERE id = 1");
    await database.client.execute(`
      CREATE TRIGGER reject_seed_review BEFORE INSERT ON reviews
      BEGIN SELECT RAISE(ABORT, 'deliberate seed failure'); END
    `);

    await expect(seedDatabase(database, seedTime)).rejects.toThrow(/deliberate seed failure/);

    const reviews = await database.client.execute("SELECT COUNT(*) AS count FROM reviews");
    expect(reviews.rows[0].count).toBe(20);
    const review = await database.client.execute("SELECT body FROM reviews WHERE id = 1");
    expect(review.rows[0].body).toBe("Keep this review on failed reset");
    const bookings = await database.client.execute("SELECT COUNT(*) AS count, SUM(seats) AS seats FROM bookings");
    expect(bookings.rows[0]).toMatchObject({ count: 7, seats: 29 });
  });
});
