import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { openDatabase, type Database } from "../db/database";
import { initializeDatabase } from "../db/schema";
import { seedDatabase } from "../db/seed";
import { AppError } from "../http/errors";
import { parseBookingInput, parsePositiveInteger, parseReviewInput, parseUserIdHeader } from "../http/validation";
import { createTestDirectory } from "./helpers/database";

describe("database-backed read API contract", () => {
  let directory: string;
  let database: Database;

  beforeEach(async () => {
    directory = await createTestDirectory("api-");
    database = await openDatabase({ path: join(directory, "test.sqlite") });
    await initializeDatabase(database);
    await seedDatabase(database, new Date("2030-06-15T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    database?.close();
  });

  it("returns the three persisted demo users in a consistent envelope", async () => {
    const response = await request(createApp(database)).get("/api/users");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [
      { id: 1, name: "Sara" },
      { id: 2, name: "Abel" },
      { id: 3, name: "Liya" },
    ] });
  });

  it("sorts by the real weighted score rather than raw averages", async () => {
    const response = await request(createApp(database)).get("/api/places");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(10);
    const museum = response.body.data.find((place: { id: number }) => place.id === 1);
    const cafe = response.body.data.find((place: { id: number }) => place.id === 2);
    expect(museum).toMatchObject({ reviewCount: 3, averageRating: 14 / 3, rankingScore: 3.9375 });
    expect(cafe).toMatchObject({ reviewCount: 1, averageRating: 5, rankingScore: 3.75 });
    expect(response.body.data.indexOf(museum)).toBeLessThan(response.body.data.indexOf(cafe));
    const scores = response.body.data.map((place: { rankingScore: number }) => place.rankingScore);
    expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
    expect(museum).not.toHaveProperty("opening_hours");
    expect(museum).toHaveProperty("openingHours");
    expect(museum).toHaveProperty("imageRef", null);
  });

  it("filters by category and supports deterministic name sorting", async () => {
    const response = await request(createApp(database)).get("/api/places?category=Food&sort=name");
    expect(response.status).toBe(200);
    expect(response.body.data.map((place: { name: string }) => place.name)).toEqual([
      "New Corner Café", "Tomoca Coffee", "Yod Abyssinia Cultural Restaurant",
    ]);
    expect(response.body.data.every((place: { category: string }) => place.category === "Food")).toBe(true);
  });

  it.each([
    "category=all", "category=history", "category=Unknown", "category=Food&category=Nature",
    "sort=rating", "sort=name&sort=top-rated", "unexpected=value",
  ])("rejects invalid or ambiguous filters (%s)", async (query) => {
    const response = await request(createApp(database)).get(`/api/places?${query}`);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "INVALID_QUERY", message: expect.any(String) });
  });

  it("keeps detail statistics consistent while aggregating bookings independently", async () => {
    const app = createApp(database);
    const list = await request(app).get("/api/places");
    const detail = await request(app).get("/api/places/1");
    expect(detail.status).toBe(200);
    const summary = list.body.data.find((place: { id: number }) => place.id === 1);
    const { reviews, tourSlots, ...detailSummary } = detail.body.data;
    expect(detailSummary).toEqual(summary);
    expect(reviews).toHaveLength(3);
    expect(reviews.map((review: { rating: number }) => review.rating).sort()).toEqual([4, 5, 5]);
    expect(reviews[0]).toMatchObject({
      user: { id: expect.any(Number), name: expect.any(String) },
      body: expect.any(String), createdAt: "2030-06-15T10:00:00.000Z", updatedAt: "2030-06-15T10:00:00.000Z",
    });
    expect(tourSlots.map((slot: { capacity: number; bookedSeats: number; availableSeats: number }) => ({
      capacity: slot.capacity, bookedSeats: slot.bookedSeats, availableSeats: slot.availableSeats,
    }))).toEqual([
      { capacity: 10, bookedSeats: 6, availableSeats: 4 },
      { capacity: 10, bookedSeats: 9, availableSeats: 1 },
    ]);
    expect(tourSlots[0]).toMatchObject({ id: 1, startsAt: "2030-06-16T06:00:00.000Z" });
    expect(detail.text).not.toContain("user_id");
  });

  it("represents unrated places and places without tours explicitly", async () => {
    await database.client.execute(`INSERT INTO places
      (id, name, category, description, opening_hours, image_ref)
      VALUES (99, 'A New Place', 'History', 'Not reviewed yet.', 'Daily', NULL)`);
    // Even a very low rated place must stay ahead of unrated places in top-rated ordering.
    await database.client.execute("UPDATE reviews SET rating = 1 WHERE place_id = 10");
    const app = createApp(database);
    const list = await request(app).get("/api/places");
    expect(list.body.data.at(-1)).toMatchObject({ id: 99, reviewCount: 0, averageRating: null, rankingScore: 3.5 });
    const detail = await request(app).get("/api/places/99");
    expect(detail.body.data).toMatchObject({ reviewCount: 0, averageRating: null, rankingScore: 3.5, reviews: [], tourSlots: [] });
  });

  it("distinguishes missing places from invalid identifiers", async () => {
    const app = createApp(database);
    const missing = await request(app).get("/api/places/9999");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "PLACE_NOT_FOUND", message: "Place not found." });
    for (const id of ["0", "-1", "1.5", "abc", "9007199254740992"]) {
      const invalid = await request(app).get(`/api/places/${id}`);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toBe("VALIDATION_ERROR");
    }
  });

  it("turns malformed JSON into a safe client error", async () => {
    const response = await request(createApp(database))
      .get("/api/places")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "INVALID_JSON", message: "Request body must be valid JSON." });
  });

  it("sanitizes unexpected failures instead of returning SQL, paths, or a stack", async () => {
    vi.spyOn(database.client, "execute").mockRejectedValueOnce(new Error("SELECT secret FROM C:\\private\\wayfarer.db"));
    const response = await request(createApp(database)).get("/api/users");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." });
    expect(response.text).not.toMatch(/SELECT|private|stack/);
  });

  it("reports oversized bodies and unsupported charsets as client errors", async () => {
    const app = createApp(database);
    const oversized = await request(app).get("/api/places")
      .set("Content-Type", "application/json").send(JSON.stringify({ text: "x".repeat(110_000) }));
    expect(oversized.status).toBe(413);
    expect(oversized.body).toEqual({ error: "PAYLOAD_TOO_LARGE", message: "Request body is too large." });
    const unsupported = await request(app).get("/api/places")
      .set("Content-Type", "application/json; charset=iso-8859-1").send("{}");
    expect(unsupported.status).toBe(415);
    expect(unsupported.body).toEqual({ error: "UNSUPPORTED_ENCODING", message: "Request body encoding is not supported." });
  });

  it("reports SQLite contention as a retryable service error", async () => {
    vi.spyOn(database.client, "execute").mockRejectedValueOnce(Object.assign(new Error("internal lock detail"), { code: "SQLITE_BUSY" }));
    const response = await request(createApp(database)).get("/api/users");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "DATABASE_BUSY", message: "The database is busy. Please try again." });
  });
});

describe("validation shared with the pending write endpoints", () => {
  it("parses URL identifiers and the acting-user header strictly", () => {
    expect(parsePositiveInteger("1")).toBe(1);
    expect(parseUserIdHeader("3")).toBe(3);
    for (const invalid of [undefined, ["1", "2"], "", "0", "-1", "1.1", "1e2", "01", " 1", "9007199254740992"]) {
      expect(() => parseUserIdHeader(invalid)).toThrow(AppError);
    }
  });

  it("accepts review boundaries and trims surrounding whitespace", () => {
    expect(parseReviewInput({ rating: 1, body: "  A useful review.  " })).toEqual({ rating: 1, body: "A useful review." });
    expect(parseReviewInput({ rating: 5, body: "x".repeat(500) }).body).toHaveLength(500);
  });

  it.each([
    null, [], {}, { rating: "5", body: "Valid text" }, { rating: 0, body: "Valid text" },
    { rating: 6, body: "Valid text" }, { rating: 4.5, body: "Valid text" },
    { rating: 5, body: "   " }, { rating: 5, body: "x".repeat(501) },
    { rating: 5, body: "Valid text", userId: 2 },
  ])("rejects invalid review input (%j)", (input) => {
    expect(() => parseReviewInput(input)).toThrow(AppError);
  });

  it("accepts positive whole seats and rejects coercion or invalid totals", () => {
    expect(parseBookingInput({ seats: 1 })).toEqual({ seats: 1 });
    for (const seats of [undefined, "1", 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseBookingInput({ seats })).toThrow(AppError);
    }
    expect(() => parseBookingInput({ seats: 1, userId: 2 })).toThrow(AppError);
  });
});
