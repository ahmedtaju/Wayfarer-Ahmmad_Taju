import { Router } from "express";
import type { Database } from "../db/database";
import { AppError, asyncHandler } from "../http/errors";
import { parseBookingInput, parsePositiveInteger, parseUserIdHeader } from "../http/validation";
import { reserveSeats } from "../services/bookings";

export function bookingsRouter(database: Database): Router {
  const router = Router({ mergeParams: true });

  router.post("/", asyncHandler(async (req, res) => {
    if (!req.is("application/json")) {
      throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
    }
    const slotId = parsePositiveInteger(req.params.id, "Tour slot ID");
    const userId = parseUserIdHeader(req.get("X-User-Id"));
    const input = parseBookingInput(req.body);
    const booking = await reserveSeats(database, slotId, userId, input);
    res.status(201).json({ data: booking });
  }));

  return router;
}
