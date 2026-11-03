import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import type { Database } from "./db/database";
import { errorHandler } from "./http/errors";
import { placesRouter } from "./routes/places";
import { usersRouter } from "./routes/users";
import { reviewsRouter } from "./routes/reviews";

export function createApp(database?: Database) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount API routes
  app.use("/api/health", healthRouter);
  if (database) {
    app.use("/api/users", usersRouter(database));
    app.use("/api/places/:id/reviews", reviewsRouter(database));
    app.use("/api/places", placesRouter(database));
  }

  // Fallback 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND", message: "Endpoint not found" });
  });
  app.use(errorHandler);

  return app;
}

