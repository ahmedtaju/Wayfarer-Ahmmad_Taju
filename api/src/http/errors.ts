import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Express 4 does not forward rejected handler promises automatically. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function isDatabaseBusy(error: unknown): boolean {
  const visited = new Set<object>();
  let candidate = error;
  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    visited.add(candidate);
    const { code, cause } = candidate as { code?: unknown; cause?: unknown };
    if (typeof code === "string" && /^SQLITE_(BUSY|LOCKED)(?:_|$)/.test(code)) return true;
    candidate = cause;
  }
  return false;
}

/** Responses deliberately exclude database details, paths, and stack traces. */
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }

  if (
    error instanceof SyntaxError &&
    (error as SyntaxError & { type?: string }).type === "entity.parse.failed"
  ) {
    res.status(400).json({ error: "INVALID_JSON", message: "Request body must be valid JSON." });
    return;
  }

  if (isDatabaseBusy(error)) {
    res.status(503).json({ error: "DATABASE_BUSY", message: "The database is busy. Please try again." });
    return;
  }

  const parserErrorType = error && typeof error === "object"
    ? (error as { type?: unknown }).type : undefined;
  if (parserErrorType === "entity.too.large") {
    res.status(413).json({ error: "PAYLOAD_TOO_LARGE", message: "Request body is too large." });
    return;
  }
  if (parserErrorType === "charset.unsupported" || parserErrorType === "encoding.unsupported") {
    res.status(415).json({ error: "UNSUPPORTED_ENCODING", message: "Request body encoding is not supported." });
    return;
  }

  res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." });
};
