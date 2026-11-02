import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";

describe("Tooling & Driver Verification Checkpoint", () => {
  it("executes Vitest test runner successfully", () => {
    expect(true).toBe(true);
  });

  it("verifies SQLite driver connects and executes queries locally", async () => {
    const client = createClient({
      url: ":memory:",
    });

    const result = await client.execute("SELECT 1 as is_alive");
    expect(result.rows.length).toBe(1);
    expect(Number(result.rows[0].is_alive)).toBe(1);
  });
});

