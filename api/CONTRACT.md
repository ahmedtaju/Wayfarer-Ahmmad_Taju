# Wayfarer API contract

The Next.js frontend calls `/api/*`; its rewrite forwards these requests to Express.
JSON property names use camelCase. Successful domain reads return `{ "data": ... }`.
Errors return `{ "error": "CODE", "message": "Human-readable message" }` without SQL,
database paths, or stack traces. The existing `/api/health` diagnostic keeps its original payload.

## Implemented reads

### `GET /api/users`

Returns `200` and `{ "data": [{ "id": 1, "name": "Sara" }, ...] }`, ordered by ID.
These are demo acting users, not authenticated identities.

### `GET /api/places?category=History&sort=top-rated`

Both query parameters are optional. `category` is exactly `History`, `Food`, or `Nature`;
omit it to include every category. `sort` is `top-rated` (default) or `name`.
Unknown parameters, unknown values, and repeated parameters return `400 INVALID_QUERY`.

Returns `200` with a `data` array. Each place has:

```json
{
  "id": 1,
  "name": "National Museum of Ethiopia",
  "category": "History",
  "description": "...",
  "openingHours": "Daily, 09:00–17:30",
  "imageRef": null,
  "reviewCount": 3,
  "averageRating": 4.666666666666667,
  "rankingScore": 3.9375
}
```

`averageRating` is `null` for an unrated place. `rankingScore` is the unrounded weighted
score `(sumOfStars + 17.5) / (reviewCount + 5)`. Top-rated sorting puts every rated place
before unrated places, then sorts by descending score, ascending name, and ascending ID.
Name sorting uses ascending name then ID. Name comparisons use JavaScript string ordering,
so results do not depend on the server's locale.

### `GET /api/places/:id`

Returns `200` with the same place fields in `data`, plus:

```json
{
  "reviews": [{
    "id": 1,
    "rating": 5,
    "body": "A useful traveller review.",
    "createdAt": "2030-06-15T10:00:00.000Z",
    "updatedAt": "2030-06-15T10:00:00.000Z",
    "user": { "id": 1, "name": "Sara" }
  }],
  "tourSlots": [{
    "id": 1,
    "startsAt": "2030-06-16T06:00:00.000Z",
    "capacity": 10,
    "bookedSeats": 6,
    "availableSeats": 4
  }]
}
```

The review array is ordered by descending creation time and ID. Slots are ordered by
ascending start time and ID. Arrays are empty when there are no matching records.
All stored slots are returned, including full slots; clients can display availability
explicitly. Booking identities are not exposed. Summary, review, and slot queries use
one read transaction; reviews and bookings are aggregated independently.

IDs are canonical positive safe integer strings (`1`, not `0`, `01`, `1.5`, or `1e2`).
Invalid IDs return `400 VALIDATION_ERROR`; an absent place returns `404 PLACE_NOT_FOUND`.

## Planned writes — not implemented in this milestone

The following contracts reserve the interface for the later review and booking work.
These routes currently return the standard route-not-found response. Shared input
validators are implemented and tested; no write handler, review upsert, or atomic booking
has been implemented yet.

Both endpoints will require `Content-Type: application/json` and `X-User-Id: <positive integer>`.
The header selects a persisted demo user. It is not authentication. Identity must come from
this header; a `userId` field in the JSON body is rejected. Missing or invalid headers or
invalid bodies will return `400 VALIDATION_ERROR`; a missing referenced user will return
`404 USER_NOT_FOUND`.

### `POST /api/places/:id/reviews`

Body: `{ "rating": 5, "body": "A useful traveller review." }`.
Rating must be a JSON integer from 1 through 5. Review body must be a string containing
1 through 500 characters after trimming. Additional JSON fields are rejected.
One review is stored per user/place: first submission will return `201`; subsequent
submissions will update that review and return `200`. `createdAt` is preserved on update;
`updatedAt` changes. The response will be `{ "data": <review with author and timestamps> }`.
An absent place will return `404 PLACE_NOT_FOUND`. The subsequent list/detail reads must
reflect the new rating statistics.

### `POST /api/tour-slots/:id/bookings`

Body: `{ "seats": 2 }`. Seats must be a JSON safe integer greater than zero.
Additional JSON fields are rejected. An absent slot will return `404 SLOT_NOT_FOUND`.
The capacity check and insert must later run atomically against persisted bookings.
Insufficient remaining capacity will return `409 INSUFFICIENT_CAPACITY` without inserting
any booking. A successful booking will return `201` and
`{ "data": { "id": 1, "slotId": 1, "userId": 1, "seats": 2, "createdAt": "..." } }`.
Repeated valid submissions create separate bookings; no idempotency key is promised.

## Shared errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Malformed JSON request body. |
| 400 | `INVALID_QUERY` | Invalid or ambiguous place-list query. |
| 400 | `VALIDATION_ERROR` | Invalid ID, header, or domain input. |
| 404 | `PLACE_NOT_FOUND` | Requested place is absent. |
| 404 | `NOT_FOUND` | Route is not implemented or does not exist. |
| 404 | `USER_NOT_FOUND` / `SLOT_NOT_FOUND` | Reserved for planned writes. |
| 409 | `INSUFFICIENT_CAPACITY` | Reserved for the planned atomic booking endpoint. |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body exceeds the 100 KiB limit. |
| 415 | `UNSUPPORTED_ENCODING` | Unsupported request encoding or JSON charset. |
| 503 | `DATABASE_BUSY` | SQLite is busy or locked; a later retry may succeed. |
| 500 | `INTERNAL_ERROR` | Unexpected failure, with sanitized public details. |
