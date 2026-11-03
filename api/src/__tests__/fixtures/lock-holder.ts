import { openDatabase } from "../../db/database";

async function holdWriteLock(): Promise<void> {
  const database = await openDatabase();
  const release = async () => {
    try { await database.client.execute("ROLLBACK"); }
    finally {
      database.close();
      process.disconnect?.();
    }
  };
  try {
    await database.client.execute("BEGIN IMMEDIATE");
    process.once("message", () => {
      release().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
    });
    process.send?.({ type: "lock-ready", pid: process.pid, databasePath: database.path });
  } catch (error) {
    database.close();
    throw error;
  }
}

holdWriteLock().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
