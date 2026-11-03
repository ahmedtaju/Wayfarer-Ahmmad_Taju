import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";

/** The test runner owns this isolated root and removes it after workers exit. */
export async function createTestDirectory(prefix: string): Promise<string> {
  const root = process.env.WAYFARER_TEST_DIRECTORY;
  if (!root) throw new Error("Run database tests with npm test so temporary files are cleaned safely.");
  return mkdtemp(join(root, prefix));
}
