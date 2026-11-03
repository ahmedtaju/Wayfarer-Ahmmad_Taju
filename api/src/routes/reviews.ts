import { Router } from "express";
import type { Database } from "../db/database";
import { AppError, asyncHandler } from "../http/errors";
import { parsePositiveInteger, parseReviewInput, parseUserIdHeader } from "../http/validation";
import { saveReview } from "../services/reviews";

export function reviewsRouter(database: Database): Router {
  const router = Router({ mergeParams: true });

  router.post("/", asyncHandler(async (req, res) => {
    if (!req.is("application/json")) {
      throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
    }
    const placeId = parsePositiveInteger(req.params.id, "Place ID");
    const userId = parseUserIdHeader(req.get("X-User-Id"));
    const input = parseReviewInput(req.body);
    const result = await saveReview(database, placeId, userId, input);
    res.status(result.created ? 201 : 200).json({ data: result.review });
  }));

  return router;
}
