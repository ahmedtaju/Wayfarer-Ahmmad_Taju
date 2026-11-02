import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";

describe("Express API Health Checkpoint", () => {
  const app = createApp();

  it("responds with status 200 and health payload on GET /api/health", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("backend", "Express");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body.message).toMatch(/Express backend healthy/i);
  });

  it("returns 404 for unknown API endpoints", async () => {
    const res = await request(app).get("/api/unknown-endpoint");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "NOT_FOUND");
  });
});

