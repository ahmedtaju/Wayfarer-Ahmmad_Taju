import { Router, Request, Response } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    backend: "Express",
    timestamp: new Date().toISOString(),
    message: "Express backend healthy and reachable from Next.js",
  });
});

