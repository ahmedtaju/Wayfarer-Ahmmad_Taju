import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount API routes
  app.use("/api/health", healthRouter);

  // Fallback 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND", message: "Endpoint not found" });
  });

  return app;
}

