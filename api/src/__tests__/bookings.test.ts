import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { openDatabase, type Database } from "../db/database";
import { initializeDatabase } from "../db/schema";
import { seedDatabase } from "../db/seed";
import { reserveSeats } from "../services/bookings";
import { createTestDirectory } from "./helpers/database";

describe("capacity-protected booking API", () => {
  let database: Database;

  beforeEach(async () => {
    const directory = await createTestDirectory("bookings-");
    database = await openDatabase({ path: join(directory, "test.sqlite") });
    await initializeDatabase(database);
    await seedDatabase(database, new Date("2030-06-15T10:00:00.000Z"));
  });

  afterEach(() => {
    database?.close();
  });

  it("persists one-seat and multi-seat bookings and derives updated availability", async () => {
    const app = createApp(database);
    const single = await request(app).post("/api/tour-slots/1/bookings")
      .set("X-User-Id", "3").send({ seats: 1 });
    expect(single.status).toBe(201);
    expect(single.body.data).toEqual({
      id: expect.any(Number), slotId: 1, userId: 3, seats: 1, createdAt: expect.any(String),
    });
    expect(new Date(single.body.data.createdAt).toISOString()).toBe(single.body.data.createdAt);

    const multiple = await request(app).post("/api/tour-slots/1/bookings")
      .set("X-User-Id", "2").send({ seats: 3 });
    expect(multiple.status).toBe(201);
    expect(multiple.body.data).toMatchObject({ slotId: 1, userId: 2, seats: 3 });
    expect(multiple.body.data.id).not.toBe(single.body.data.id);

    const stored = await database.client.execute({
      sql: "SELECT id, slot_id, user_id, seats, created_at FROM bookings WHERE id IN (?, ?) ORDER BY id",
      args: [single.body.data.id, multiple.body.data.id],
    });
    expect(stored.rows).toMatchObject([
      { id: single.body.data.id, slot_id: 1, user_id: 3, seats: 1, created_at: single.body.data.createdAt },
      { id: multiple.body.data.id, slot_id: 1, user_id: 2, seats: 3, created_at: multiple.body.data.createdAt },
    ]);
    const detail = await request(app).get("/api/places/1");
    expect(detail.body.data.tourSlots[0]).toMatchObject({ capacity: 10, bookedSeats: 10, availableSeats: 0 });
    expect(detail.body.data.tourSlots[1]).toMatchObject({ capacity: 10, bookedSeats: 9, availableSeats: 1 });
  });

  it("rejects a full tour and a request larger than remaining capacity without partial bookings", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM bookings ORDER BY id");
    for (const [slot, seats] of [[3, 1], [2, 2]]) {
      const response = await request(app).post(`/api/tour-slots/${slot}/bookings`)
        .set("X-User-Id", "1").send({ seats });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: "INSUFFICIENT_CAPACITY", message: "Not enough seats remain for this booking.",
      });
    }
    expect((await database.client.execute("SELECT * FROM bookings ORDER BY id")).rows).toEqual(original.rows);
  });

  it("confirms the last seat once and rejects subsequent requests", async () => {
    const app = createApp(database);
    const first = await request(app).post("/api/tour-slots/2/bookings")
      .set("X-User-Id", "1").send({ seats: 1 });
    const second = await request(app).post("/api/tour-slots/2/bookings")
      .set("X-User-Id", "3").send({ seats: 1 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("INSUFFICIENT_CAPACITY");
    const stored = await database.client.execute("SELECT COUNT(*) AS count, SUM(seats) AS seats FROM bookings WHERE slot_id = 2");
    expect(stored.rows[0]).toMatchObject({ count: 3, seats: 10 });
  });

  it("validates whole positive seats and rejects identity in the request body", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM bookings ORDER BY id");
    const invalidInputs = [
      {}, { seats: 0 }, { seats: -1 }, { seats: 1.5 }, { seats: "1" }, { seats: null },
      { seats: Number.MAX_SAFE_INTEGER + 1 }, { seats: 1, userId: 2 }, [],
    ];
    for (const input of invalidInputs) {
      const response = await request(app).post("/api/tour-slots/1/bookings")
        .set("X-User-Id", "1").send(input);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "VALIDATION_ERROR", message: expect.any(String) });
    }
    expect((await database.client.execute("SELECT * FROM bookings ORDER BY id")).rows).toEqual(original.rows);
  });

  it("rejects missing or invalid acting users and invalid slot identifiers", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM bookings ORDER BY id");
    for (const header of [undefined, "0", "-1", "1.5", "01", "abc", "9007199254740992"]) {
      const pending = request(app).post("/api/tour-slots/1/bookings");
      if (header !== undefined) pending.set("X-User-Id", header);
      const response = await pending.send({ seats: 1 });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
    }
    for (const slot of ["0", "-1", "1.5", "01", "abc", "9007199254740992"]) {
      const response = await request(app).post(`/api/tour-slots/${slot}/bookings`)
        .set("X-User-Id", "1").send({ seats: 1 });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
    }
    expect((await database.client.execute("SELECT * FROM bookings ORDER BY id")).rows).toEqual(original.rows);
  });

  it("distinguishes absent users and slots without inserting a booking", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM bookings ORDER BY id");
    const unknownUser = await request(app).post("/api/tour-slots/1/bookings")
      .set("X-User-Id", "999").send({ seats: 1 });
    expect(unknownUser.status).toBe(404);
    expect(unknownUser.body).toEqual({ error: "USER_NOT_FOUND", message: "User not found." });

    const unknownSlot = await request(app).post("/api/tour-slots/999/bookings")
      .set("X-User-Id", "1").send({ seats: 1 });
    expect(unknownSlot.status).toBe(404);
    expect(unknownSlot.body).toEqual({ error: "SLOT_NOT_FOUND", message: "Tour slot not found." });
    expect((await database.client.execute("SELECT * FROM bookings ORDER BY id")).rows).toEqual(original.rows);
  });

  it("requires JSON and handles malformed bodies without a booking", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM bookings ORDER BY id");
    const wrongType = await request(app).post("/api/tour-slots/1/bookings")
      .set("X-User-Id", "1").set("Content-Type", "text/plain").send("1");
    expect(wrongType.status).toBe(415);
    expect(wrongType.body).toEqual({ error: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." });
    const malformed = await request(app).post("/api/tour-slots/1/bookings")
      .set("X-User-Id", "1").set("Content-Type", "application/json").send('{"seats":');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: "INVALID_JSON", message: "Request body must be valid JSON." });
    expect((await database.client.execute("SELECT * FROM bookings ORDER BY id")).rows).toEqual(original.rows);
  });

  it("stores the supplied service clock and preserves bookings after reopening the database", async () => {
    const now = new Date("2030-06-15T12:30:00.000Z");
    const booking = await reserveSeats(database, 1, 3, { seats: 2 }, now);
    expect(booking).toEqual({ id: expect.any(Number), slotId: 1, userId: 3, seats: 2, createdAt: now.toISOString() });

    const path = database.path;
    database.close();
    database = await openDatabase({ path });
    await initializeDatabase(database);
    const stored = await database.client.execute({ sql: "SELECT * FROM bookings WHERE id = ?", args: [booking.id] });
    expect(stored.rows[0]).toMatchObject({
      id: booking.id, slot_id: 1, user_id: 3, seats: 2, created_at: now.toISOString(),
    });
    const detail = await request(createApp(database)).get("/api/places/1");
    expect(detail.body.data.tourSlots[0]).toMatchObject({ capacity: 10, bookedSeats: 8, availableSeats: 2 });
  });

  it("rolls back an inserted booking when the database operation fails", async () => {
    const original = await database.client.execute("SELECT * FROM bookings ORDER BY id");
    await database.client.execute(`
      CREATE TRIGGER reject_booking AFTER INSERT ON bookings
      BEGIN SELECT RAISE(ABORT, 'deliberate booking failure'); END
    `);
    const failed = await request(createApp(database)).post("/api/tour-slots/1/bookings")
      .set("X-User-Id", "3").send({ seats: 1 });

    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." });
    expect((await database.client.execute("SELECT * FROM bookings ORDER BY id")).rows).toEqual(original.rows);
  });
});
