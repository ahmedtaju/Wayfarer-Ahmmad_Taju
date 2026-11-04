import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { openDatabase, type Database } from "../db/database";
import { initializeDatabase } from "../db/schema";
import { seedDatabase } from "../db/seed";
import type { PlaceDetail, PlaceSummary } from "../services/places";
import { createTestDirectory } from "./helpers/database";

describe("place browsing and complete detail responses", () => {
  let database: Database;

  beforeEach(async () => {
    const directory = await createTestDirectory("place-details-");
    database = await openDatabase({ path: join(directory, "test.sqlite") });
    await initializeDatabase(database);
    await seedDatabase(database, new Date("2030-06-15T10:00:00.000Z"));
  });

  afterEach(() => {
    database?.close();
  });

  it.each([
    ["category=History&sort=top-rated", [1, 3, 4, 10]],
    ["category=History&sort=name", [3, 4, 10, 1]],
    ["category=Food&sort=top-rated", [8, 7, 2]],
    ["category=Food&sort=name", [2, 8, 7]],
    ["category=Nature&sort=top-rated", [5, 9, 6]],
    ["category=Nature&sort=name", [5, 9, 6]],
    ["sort=top-rated", [1, 5, 3, 8, 7, 2, 9, 4, 10, 6]],
    ["sort=name", [5, 3, 9, 4, 10, 1, 2, 8, 6, 7]],
    ["", [1, 5, 3, 8, 7, 2, 9, 4, 10, 6]],
  ])("returns the expected places for %s", async (query, expectedIds) => {
    const response = await request(createApp(database)).get(`/api/places${query ? `?${query}` : ""}`);
    expect(response.status).toBe(200);
    const places = response.body.data as PlaceSummary[];
    expect(places.map((place) => place.id)).toEqual(expectedIds);
  });

  it("keeps rating statistics unchanged when a place has several reviews, slots, and bookings", async () => {
    const app = createApp(database);
    const before = await request(app).get("/api/places/1");
    await database.client.batch([
      { sql: "INSERT INTO bookings (slot_id,user_id,seats,created_at) VALUES (1,1,1,?)", args: ["2030-06-15T11:00:00.000Z"] },
      { sql: "INSERT INTO bookings (slot_id,user_id,seats,created_at) VALUES (1,3,1,?)", args: ["2030-06-15T11:01:00.000Z"] },
    ], "write");

    const response = await request(app).get("/api/places/1");
    const listResponse = await request(app).get("/api/places");
    expect(response.status).toBe(200);
    const detail = response.body.data as PlaceDetail;
    const listed = (listResponse.body.data as PlaceSummary[]).find((place) => place.id === 1);
    expect(detail).toMatchObject({
      reviewCount: 3,
      averageRating: 14 / 3,
      rankingScore: 3.9375,
      timeZone: "Africa/Addis_Ababa",
    });
    expect(detail.reviews).toEqual(before.body.data.reviews);
    expect(detail.reviews.map((review) => review.user)).toEqual([
      { id: 3, name: "Liya" }, { id: 2, name: "Abel" }, { id: 1, name: "Sara" },
    ]);
    expect(detail.reviews.every((review) => review.createdAt === "2030-06-15T10:00:00.000Z" && review.updatedAt === review.createdAt)).toBe(true);
    expect(detail.tourSlots.map(({ bookedSeats, availableSeats }) => ({ bookedSeats, availableSeats }))).toEqual([
      { bookedSeats: 8, availableSeats: 2 },
      { bookedSeats: 9, availableSeats: 1 },
    ]);
    expect(detail).toMatchObject(listed as PlaceSummary);
  });

  it("preserves the UTC instant and labels a slot using Addis Ababa's next calendar day", async () => {
    await database.client.execute({
      sql: "UPDATE tour_slots SET starts_at = ? WHERE id = 1",
      args: ["2030-06-15T22:30:00.000Z"],
    });
    const response = await request(createApp(database)).get("/api/places/1");
    expect(response.status).toBe(200);
    expect(response.body.data.timeZone).toBe("Africa/Addis_Ababa");
    expect(response.body.data.tourSlots[0]).toMatchObject({
      id: 1,
      startsAt: "2030-06-15T22:30:00.000Z",
      startsAtLabel: "16 Jun 2030, 01:30",
    });
    expect(response.body.data.tourSlots[1]).toMatchObject({
      startsAt: "2030-06-17T06:00:00.000Z",
      startsAtLabel: "17 Jun 2030, 09:00",
    });
  });

  it("includes full slots and slots with no bookings using accurate remaining seats", async () => {
    const app = createApp(database);
    const full = await request(app).get("/api/places/3");
    const empty = await request(app).get("/api/places/7");
    expect(full.status).toBe(200);
    expect(full.body.data.tourSlots).toHaveLength(1);
    expect(full.body.data.tourSlots[0]).toMatchObject({ id: 3, capacity: 10, bookedSeats: 10, availableSeats: 0 });
    expect(empty.status).toBe(200);
    expect(empty.body.data.tourSlots).toHaveLength(1);
    expect(empty.body.data.tourSlots[0]).toMatchObject({ id: 5, capacity: 6, bookedSeats: 0, availableSeats: 6 });
  });

  it("returns explicit empty collections and no raw average for an unrated place without tours", async () => {
    await database.client.execute(`INSERT INTO places (id,name,category,description,opening_hours)
      VALUES (99,'New Garden','Nature','A newly listed garden.','Daily, 09:00–17:00')`);
    const response = await request(createApp(database)).get("/api/places/99");
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: 99, reviewCount: 0, averageRating: null, rankingScore: 3.5,
      reviews: [], tourSlots: [], timeZone: "Africa/Addis_Ababa",
    });
  });

  it("returns the documented missing-place error", async () => {
    const response = await request(createApp(database)).get("/api/places/9999");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "PLACE_NOT_FOUND", message: "Place not found." });
  });
});
