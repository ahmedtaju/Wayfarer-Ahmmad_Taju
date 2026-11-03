import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { openDatabase, type Database } from "../db/database";
import { initializeDatabase } from "../db/schema";
import { seedDatabase } from "../db/seed";
import { saveReview } from "../services/reviews";
import { createTestDirectory } from "./helpers/database";

const seedTime = new Date("2020-06-15T10:00:00.000Z");

describe("review creation and replacement API", () => {
  let database: Database;

  beforeEach(async () => {
    const directory = await createTestDirectory("reviews-");
    database = await openDatabase({ path: join(directory, "test.sqlite") });
    await initializeDatabase(database);
    await seedDatabase(database, seedTime);
  });

  afterEach(() => {
    database?.close();
  });

  it("creates and edits Sara's one review while Abel receives a separate review", async () => {
    await database.client.execute("DELETE FROM reviews WHERE place_id = 2");
    const app = createApp(database);
    const created = await request(app).post("/api/places/2/reviews")
      .set("X-User-Id", "1").send({ rating: 5, body: "  A lovely first visit.  " });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      id: expect.any(Number), rating: 5, body: "A lovely first visit.",
      user: { id: 1, name: "Sara" },
      createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    expect(created.body.data.updatedAt).toBe(created.body.data.createdAt);
    expect(new Date(created.body.data.createdAt).toISOString()).toBe(created.body.data.createdAt);

    const edited = await request(app).post("/api/places/2/reviews")
      .set("X-User-Id", "1").send({ rating: 2, body: "A different experience on my return." });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      id: created.body.data.id, rating: 2, body: "A different experience on my return.",
      createdAt: created.body.data.createdAt, user: { id: 1, name: "Sara" },
    });

    const abel = await request(app).post("/api/places/2/reviews")
      .set("X-User-Id", "2").send({ rating: 4, body: "A good place for coffee." });
    expect(abel.status).toBe(201);
    expect(abel.body.data.user).toEqual({ id: 2, name: "Abel" });
    expect(abel.body.data.id).not.toBe(created.body.data.id);

    const stored = await database.client.execute("SELECT user_id, rating FROM reviews WHERE place_id = 2 ORDER BY user_id");
    expect(stored.rows).toMatchObject([{ user_id: 1, rating: 2 }, { user_id: 2, rating: 4 }]);
    const detail = await request(app).get("/api/places/2");
    expect(detail.body.data).toMatchObject({ reviewCount: 2, averageRating: 3, rankingScore: 23.5 / 7 });
  });

  it("updates actual averages and ranking without increasing the count during an edit", async () => {
    const app = createApp(database);
    const before = await request(app).get("/api/places/1");
    expect(before.body.data).toMatchObject({ reviewCount: 3, averageRating: 14 / 3 });
    const originalSara = before.body.data.reviews.find((review: { user: { id: number } }) => review.user.id === 1);

    const edited = await request(app).post("/api/places/1/reviews")
      .set("X-User-Id", "1").send({ rating: 1, body: "My updated assessment." });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ id: originalSara.id, createdAt: originalSara.createdAt, rating: 1 });

    const after = await request(app).get("/api/places/1");
    expect(after.body.data).toMatchObject({ reviewCount: 3, averageRating: 10 / 3, rankingScore: 27.5 / 8 });
    const list = await request(app).get("/api/places");
    expect(list.body.data.find((place: { id: number }) => place.id === 1)).toMatchObject({
      reviewCount: 3, averageRating: 10 / 3, rankingScore: 27.5 / 8,
    });
  });

  it("preserves creation time and records the supplied update clock in UTC", async () => {
    const firstUpdate = new Date("2031-01-01T12:00:00.000Z");
    const secondUpdate = new Date("2031-01-02T12:00:00.000Z");
    const first = await saveReview(database, 1, 1, { rating: 4, body: "First update." }, firstUpdate);
    const second = await saveReview(database, 1, 1, { rating: 3, body: "Second update." }, secondUpdate);

    expect(first.created).toBe(false);
    expect(second.created).toBe(false);
    expect(second.review).toMatchObject({
      id: first.review.id, createdAt: seedTime.toISOString(), updatedAt: secondUpdate.toISOString(),
      rating: 3, body: "Second update.",
    });
    expect(first.review.updatedAt).toBe(firstUpdate.toISOString());
  });

  it("rejects missing or invalid acting-user headers without altering reviews", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM reviews ORDER BY id");
    for (const header of [undefined, "0", "-1", "1.5", "01", "abc", "9007199254740992"]) {
      const pending = request(app).post("/api/places/1/reviews");
      if (header !== undefined) pending.set("X-User-Id", header);
      const response = await pending.send({ rating: 5, body: "A useful review." });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "VALIDATION_ERROR", message: expect.any(String) });
    }
    const stored = await database.client.execute("SELECT * FROM reviews ORDER BY id");
    expect(stored.rows).toEqual(original.rows);
  });

  it("returns clear errors for absent users and places without inserting a review", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM reviews ORDER BY id");
    const unknownUser = await request(app).post("/api/places/1/reviews")
      .set("X-User-Id", "999").send({ rating: 5, body: "A useful review." });
    expect(unknownUser.status).toBe(404);
    expect(unknownUser.body).toEqual({ error: "USER_NOT_FOUND", message: "User not found." });

    const unknownPlace = await request(app).post("/api/places/999/reviews")
      .set("X-User-Id", "1").send({ rating: 5, body: "A useful review." });
    expect(unknownPlace.status).toBe(404);
    expect(unknownPlace.body).toEqual({ error: "PLACE_NOT_FOUND", message: "Place not found." });

    const invalidPlace = await request(app).post("/api/places/1.5/reviews")
      .set("X-User-Id", "1").send({ rating: 5, body: "A useful review." });
    expect(invalidPlace.status).toBe(400);
    expect(invalidPlace.body.error).toBe("VALIDATION_ERROR");
    expect((await database.client.execute("SELECT * FROM reviews ORDER BY id")).rows).toEqual(original.rows);
  });

  it("validates ratings, trimmed text, and disallows identity in the body", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM reviews ORDER BY id");
    const invalidInputs = [
      { rating: 0, body: "Useful text." },
      { rating: 6, body: "Useful text." },
      { rating: 4.5, body: "Useful text." },
      { rating: "5", body: "Useful text." },
      { body: "Missing rating." },
      { rating: 5, body: " \n\t " },
      { rating: 5, body: "x".repeat(501) },
      { rating: 5, body: "Useful text.", userId: 2 },
    ];
    for (const input of invalidInputs) {
      const response = await request(app).post("/api/places/1/reviews").set("X-User-Id", "1").send(input);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "VALIDATION_ERROR", message: expect.any(String) });
    }
    expect((await database.client.execute("SELECT * FROM reviews ORDER BY id")).rows).toEqual(original.rows);
  });

  it("accepts the 500-character boundary after trimming", async () => {
    const response = await request(createApp(database)).post("/api/places/1/reviews")
      .set("X-User-Id", "1").send({ rating: 5, body: `  ${"x".repeat(500)}  ` });
    expect(response.status).toBe(200);
    expect(response.body.data.body).toBe("x".repeat(500));
    const stored = await database.client.execute("SELECT body FROM reviews WHERE place_id = 1 AND user_id = 1");
    expect(stored.rows[0].body).toBe(response.body.data.body);
  });

  it("requires JSON and reports malformed JSON consistently", async () => {
    const app = createApp(database);
    const original = await database.client.execute("SELECT * FROM reviews ORDER BY id");
    const wrongType = await request(app).post("/api/places/1/reviews")
      .set("X-User-Id", "1").set("Content-Type", "text/plain").send("A useful review.");
    expect(wrongType.status).toBe(415);
    expect(wrongType.body).toEqual({ error: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." });
    const malformed = await request(app).post("/api/places/1/reviews")
      .set("X-User-Id", "1").set("Content-Type", "application/json").send('{"rating":');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: "INVALID_JSON", message: "Request body must be valid JSON." });
    expect((await database.client.execute("SELECT * FROM reviews ORDER BY id")).rows).toEqual(original.rows);
  });

  it("preserves a saved review after reopening the same database", async () => {
    const saved = await request(createApp(database)).post("/api/places/1/reviews")
      .set("X-User-Id", "1").send({ rating: 2, body: "This edit must survive a restart." });
    expect(saved.status).toBe(200);
    const path = database.path;
    database.close();
    database = await openDatabase({ path });
    await initializeDatabase(database);

    const detail = await request(createApp(database)).get("/api/places/1");
    expect(detail.status).toBe(200);
    expect(detail.body.data.reviews.find((review: { id: number }) => review.id === saved.body.data.id)).toEqual(saved.body.data);
    expect(detail.body.data.reviewCount).toBe(3);
  });

  it("leaves an existing review unchanged if its upsert fails", async () => {
    const original = await database.client.execute("SELECT * FROM reviews ORDER BY id");
    await database.client.execute(`
      CREATE TRIGGER reject_review_update BEFORE UPDATE ON reviews
      BEGIN SELECT RAISE(ABORT, 'deliberate review failure'); END
    `);
    const failed = await request(createApp(database)).post("/api/places/1/reviews")
      .set("X-User-Id", "1").send({ rating: 1, body: "This update must not persist." });
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." });
    expect((await database.client.execute("SELECT * FROM reviews ORDER BY id")).rows).toEqual(original.rows);
  });
});
