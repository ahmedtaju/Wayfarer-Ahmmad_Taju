import { Router } from "express";
import type { Database } from "../db/database";
import { asyncHandler } from "../http/errors";
import { parsePlaceFilters, parsePositiveInteger } from "../http/validation";
import { getPlaceDetail, listPlaces } from "../services/places";

export function placesRouter(database: Database): Router {
  const router = Router();

  router.get("/", asyncHandler(async (req, res) => {
    const filters = parsePlaceFilters(req.query);
    res.json({ data: await listPlaces(database, filters) });
  }));

  router.get("/:id", asyncHandler(async (req, res) => {
    const id = parsePositiveInteger(req.params.id, "Place ID");
    res.json({ data: await getPlaceDetail(database, id) });
  }));

  return router;
}
