import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../db/database";
import { initializeDatabase } from "../db/schema";
import { seedDatabase } from "../db/seed";
import { createTestDirectory } from "./helpers/database";
import { startApiProcess, startLockHolder, stopProcess, type ReadyProcess } from "./helpers/processes";

describe("booking across independent Express processes", () => {
  let database: Database;
  let servers: Array<ReadyProcess & { port: number }>;
  let children: ReadyProcess[];

  beforeEach(async () => {
    children = [];
    servers = [];
    const directory = await createTestDirectory("parallel-booking-");
    database = await openDatabase({ path: join(directory, "test.sqlite") });
    await initializeDatabase(database);
    await seedDatabase(database, new Date("2030-06-15T10:00:00.000Z"));
    await database.client.execute("UPDATE reviews SET body = 'Preserve changes across API startup.' WHERE id = 1");
    // Slot 2 has capacity ten and nine persisted seats already booked.
    // Record each child immediately so a later startup failure cannot orphan it.
    for (let index = 0; index < 2; index++) {
      const server = await startApiProcess(database.path);
      servers.push(server);
      children.push(server);
    }
  }, 40_000);

  afterEach(async () => {
    try { await Promise.all(children.map(({ child }) => stopProcess(child))); }
    finally { database?.close(); }
  });

  async function book(port: number, userId: number, slotId = 2) {
    const response = await fetch(`http://127.0.0.1:${port}/api/tour-slots/${slotId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": String(userId) },
      body: JSON.stringify({ seats: 1 }),
      signal: AbortSignal.timeout(12_000),
    });
    return { status: response.status, body: await response.json() };
  }

  it("confirms exactly one of twenty simultaneous requests for the last seat", async () => {
    expect(servers[0].pid).not.toBe(servers[1].pid);
    expect(servers[0].port).not.toBe(servers[1].port);
    expect(servers.every((server) => server.databasePath === database.path)).toBe(true);
    const persisted = await database.client.execute("SELECT body FROM reviews WHERE id = 1");
    expect(persisted.rows[0].body).toBe("Preserve changes across API startup.");
    const before = await database.client.execute("SELECT * FROM bookings WHERE slot_id = 2 ORDER BY id");
    expect(before.rows.reduce((sum, row) => sum + Number(row.seats), 0)).toBe(9);

    const outcomes = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      book(servers[index % 2].port, index % 3 + 1)));
    const successes = outcomes.filter((outcome) => outcome.status === 201);
    const conflicts = outcomes.filter((outcome) => outcome.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(19);
    for (const conflict of conflicts) {
      expect(conflict.body).toEqual({
        error: "INSUFFICIENT_CAPACITY", message: "Not enough seats remain for this booking.",
      });
    }

    const after = await database.client.execute("SELECT * FROM bookings WHERE slot_id = 2 ORDER BY id");
    expect(after.rows).toHaveLength(before.rows.length + 1);
    expect(after.rows.reduce((sum, row) => sum + Number(row.seats), 0)).toBe(10);
    const confirmed = successes[0].body.data;
    expect(after.rows.find((row) => row.id === confirmed.id)).toMatchObject({
      id: confirmed.id, slot_id: 2, user_id: confirmed.userId, seats: 1, created_at: confirmed.createdAt,
    });
    const violations = await database.client.execute(`SELECT s.id FROM tour_slots s
      JOIN bookings b ON b.slot_id=s.id GROUP BY s.id HAVING SUM(b.seats)>s.capacity`);
    expect(violations.rows).toHaveLength(0);
  }, 20_000);

  it("distinguishes a held write lock from a full tour and can book after release", async () => {
    const original = await database.client.execute("SELECT * FROM bookings ORDER BY id");
    const lock = await startLockHolder(database.path);
    children.push(lock);
    let busy;
    try { busy = await book(servers[0].port, 1); }
    finally { await stopProcess(lock.child); }
    expect(busy.status).toBe(503);
    expect(busy.body).toEqual({ error: "DATABASE_BUSY", message: "The database is busy. Please try again." });
    expect((await database.client.execute("SELECT * FROM bookings ORDER BY id")).rows).toEqual(original.rows);

    const accepted = await book(servers[1].port, 1);
    expect(accepted.status).toBe(201);
    const full = await book(servers[0].port, 2);
    expect(full.status).toBe(409);
    expect(full.body.error).toBe("INSUFFICIENT_CAPACITY");
    const recovered = await book(servers[0].port, 3, 1);
    expect(recovered.status).toBe(201);
    expect(recovered.body.data).toMatchObject({ slotId: 1, userId: 3, seats: 1 });
  }, 30_000);
});
