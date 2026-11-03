import { createApp } from "./app";
import { openDatabase } from "./db/database";
import { initializeDatabase } from "./db/schema";

async function start(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }
  const database = await openDatabase();
  try {
    await initializeDatabase(database);
    const app = createApp(database);
    const server = app.listen(port, () => {
      console.log(`Wayfarer API listening on http://localhost:${port}`);
    });
    server.on("error", (error) => {
      database.close();
      console.error("API server failed:", error);
      process.exitCode = 1;
    });
    const stop = () => {
      server.close(() => database.close());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    database.close();
    throw error;
  }
}

start().catch((error: unknown) => {
  console.error("API startup failed:", error);
  process.exitCode = 1;
});

