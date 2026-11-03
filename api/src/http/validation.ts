import { AppError } from "./errors";

export type PlaceCategory = "History" | "Food" | "Nature";
export type PlaceSort = "top-rated" | "name";
export interface PlaceFilters {
  category?: PlaceCategory;
  sort: PlaceSort;
}

function invalid(message: string): never {
  throw new AppError(400, "VALIDATION_ERROR", message);
}

/** URL IDs and acting-user headers use canonical positive decimal integers. */
export function parsePositiveInteger(value: unknown, field = "id"): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return invalid(`${field} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return invalid(`${field} must be a safe positive integer.`);
  return parsed;
}

export function parseUserIdHeader(value: unknown): number {
  return parsePositiveInteger(value, "X-User-Id");
}

export function parsePlaceFilters(query: Record<string, unknown>): PlaceFilters {
  if (Object.keys(query).some((key) => key !== "category" && key !== "sort")) {
    throw new AppError(400, "INVALID_QUERY", "Only category and sort query parameters are supported.");
  }

  const category = query.category;
  if (category !== undefined && category !== "History" && category !== "Food" && category !== "Nature") {
    throw new AppError(400, "INVALID_QUERY", "category must be History, Food, or Nature; omit it for all places.");
  }
  const sort = query.sort ?? "top-rated";
  if (sort !== "top-rated" && sort !== "name") {
    throw new AppError(400, "INVALID_QUERY", "sort must be top-rated or name.");
  }

  return { category, sort };
}

function parseObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid("Request body must be a JSON object.");
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !fields.includes(key))) {
    return invalid(`Request body supports only ${fields.join(" and ")}.`);
  }
  return object;
}

export interface ReviewInput {
  rating: number;
  body: string;
}

export function parseReviewInput(value: unknown): ReviewInput {
  const input = parseObject(value, ["rating", "body"]);
  if (typeof input.rating !== "number" || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return invalid("rating must be an integer from 1 to 5.");
  }
  if (typeof input.body !== "string") return invalid("body must be a string.");
  const body = input.body.trim();
  if (body.length < 1 || body.length > 500) return invalid("body must contain 1 to 500 characters after trimming.");
  return { rating: input.rating, body };
}

export interface BookingInput {
  seats: number;
}

export function parseBookingInput(value: unknown): BookingInput {
  const input = parseObject(value, ["seats"]);
  if (typeof input.seats !== "number" || !Number.isSafeInteger(input.seats) || input.seats < 1) {
    return invalid("seats must be a safe positive integer.");
  }
  return { seats: input.seats };
}
