import { resolve } from "node:path";
import type { InStatement } from "@libsql/client";
import { openDatabase, type Database } from "./database";
import { createDemoFixtures } from "./fixtures";
import { initializeDatabase } from "./schema";

/** Explicitly resets the five demo tables, atomically; never called by startup. */
export async function seedDatabase(database: Database, now = new Date()): Promise<void> {
  const fixtures = createDemoFixtures(now);
  const statements: InStatement[] = [];
  for (const table of ["bookings", "reviews", "tour_slots", "places", "users"]) {
    statements.push(`DELETE FROM ${table}`);
  }

  for (const user of fixtures.users) {
    statements.push({
      sql: "INSERT INTO users (id, name) VALUES (?, ?)",
      args: [user.id, user.name],
    });
  }
  for (const place of fixtures.places) {
    statements.push({
      sql: `INSERT INTO places (id, name, category, description, opening_hours, image_ref)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [place.id, place.name, place.category, place.description, place.openingHours, place.imageRef],
    });
  }
  for (const review of fixtures.reviews) {
    statements.push({
      sql: `INSERT INTO reviews (id, place_id, user_id, rating, body, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [review.id, review.placeId, review.userId, review.rating, review.body, review.createdAt, review.updatedAt],
    });
  }
  for (const slot of fixtures.slots) {
    statements.push({
      sql: "INSERT INTO tour_slots (id, place_id, starts_at, capacity) VALUES (?, ?, ?, ?)",
      args: [slot.id, slot.placeId, slot.startsAt, slot.capacity],
    });
  }
  for (const booking of fixtures.bookings) {
    statements.push({
      sql: "INSERT INTO bookings (id, slot_id, user_id, seats, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [booking.id, booking.slotId, booking.userId, booking.seats, booking.createdAt],
    });
  }
  // The local driver uses BEGIN IMMEDIATE and rolls back the entire batch on failure.
  await database.client.batch(statements, "write");
}

async function runSeed(): Promise<void> {
  const database = await openDatabase();
  try {
    await initializeDatabase(database);
    await seedDatabase(database);
    console.log(`Reset demo database at ${database.path}: 3 users, 10 places, 20 reviews, 5 tour slots, 7 bookings.`);
  } finally {
    database.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  runSeed().catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  });
}
