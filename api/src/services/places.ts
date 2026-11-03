import type { Row } from "@libsql/client";
import type { Database } from "../db/database";
import { AppError } from "../http/errors";
import type { PlaceCategory, PlaceFilters } from "../http/validation";
import { calculateRanking, compareRankedPlaces } from "./ranking";

export interface PlaceSummary {
  id: number;
  name: string;
  category: PlaceCategory;
  description: string;
  openingHours: string;
  imageRef: string | null;
  reviewCount: number;
  averageRating: number | null;
  rankingScore: number;
}

export interface PlaceReview {
  id: number;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  user: { id: number; name: string };
}

export interface TourSlot {
  id: number;
  startsAt: string;
  capacity: number;
  bookedSeats: number;
  availableSeats: number;
}

export interface PlaceDetail extends PlaceSummary {
  reviews: PlaceReview[];
  tourSlots: TourSlot[];
}

// Aggregate reviews before any other relationship is joined: bookings must never
// multiply review counts, rating sums, or averages.
const summaryQuery = `
  SELECT p.id, p.name, p.category, p.description, p.opening_hours, p.image_ref,
         COALESCE(r.review_count, 0) AS review_count,
         COALESCE(r.total_stars, 0) AS total_stars
  FROM places p
  LEFT JOIN (
    SELECT place_id, COUNT(*) AS review_count, SUM(rating) AS total_stars
    FROM reviews GROUP BY place_id
  ) r ON r.place_id = p.id
`;

function toPlaceSummary(row: Row): PlaceSummary {
  const reviewCount = Number(row.review_count);
  const totalStars = Number(row.total_stars);
  return {
    id: Number(row.id),
    name: String(row.name),
    category: String(row.category) as PlaceCategory,
    description: String(row.description),
    openingHours: String(row.opening_hours),
    imageRef: row.image_ref === null ? null : String(row.image_ref),
    reviewCount,
    averageRating: reviewCount === 0 ? null : totalStars / reviewCount,
    rankingScore: calculateRanking(totalStars, reviewCount),
  };
}

function compareNames(a: PlaceSummary, b: PlaceSummary): number {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return a.id - b.id;
}

export async function listPlaces(database: Database, filters: PlaceFilters): Promise<PlaceSummary[]> {
  const result = await database.client.execute({
    sql: summaryQuery + (filters.category ? " WHERE p.category = ?" : ""),
    args: filters.category ? [filters.category] : [],
  });
  return result.rows.map(toPlaceSummary).sort(filters.sort === "name" ? compareNames : compareRankedPlaces);
}

export async function getPlaceDetail(database: Database, id: number): Promise<PlaceDetail> {
  // Keep all three reads in one SQLite snapshot, including when later writes
  // arrive between requests. This prevents mismatched summary/child statistics.
  const results = await database.client.batch([
    { sql: summaryQuery + " WHERE p.id = ?", args: [id] },
    {
      sql: `SELECT r.id, r.rating, r.body, r.created_at, r.updated_at,
                   u.id AS user_id, u.name AS user_name
            FROM reviews r JOIN users u ON u.id = r.user_id
            WHERE r.place_id = ? ORDER BY r.created_at DESC, r.id DESC`,
      args: [id],
    },
    {
      sql: `SELECT s.id, s.starts_at, s.capacity,
                   COALESCE(SUM(b.seats), 0) AS booked_seats
            FROM tour_slots s LEFT JOIN bookings b ON b.slot_id = s.id
            WHERE s.place_id = ? GROUP BY s.id
            ORDER BY s.starts_at ASC, s.id ASC`,
      args: [id],
    },
  ], "read");

  const place = results[0].rows[0];
  if (!place) throw new AppError(404, "PLACE_NOT_FOUND", "Place not found.");

  return {
    ...toPlaceSummary(place),
    reviews: results[1].rows.map((row) => ({
      id: Number(row.id),
      rating: Number(row.rating),
      body: String(row.body),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      user: { id: Number(row.user_id), name: String(row.user_name) },
    })),
    tourSlots: results[2].rows.map((row) => {
      const capacity = Number(row.capacity);
      const bookedSeats = Number(row.booked_seats);
      return {
        id: Number(row.id),
        startsAt: String(row.starts_at),
        capacity,
        bookedSeats,
        availableSeats: capacity - bookedSeats,
      };
    }),
  };
}
