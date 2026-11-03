# Wayfarer API contract

The Next.js frontend calls `/api/*`; its rewrite forwards these requests to Express.
JSON property names use camelCase. Successful domain operations return `{ "data": ... }`.
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
  "timeZone": "Africa/Addis_Ababa",
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
    "startsAtLabel": "16 Jun 2030, 09:00",
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
`startsAt` preserves the UTC instant. `startsAtLabel` uses the explicit `timeZone`, with
an English medium date and 24-hour time, regardless of the server's local time zone.
The review's `user.id` lets a client identify the selected demo user's existing review.

IDs are canonical positive safe integer strings (`1`, not `0`, `01`, `1.5`, or `1e2`).
Invalid IDs return `400 VALIDATION_ERROR`; an absent place returns `404 PLACE_NOT_FOUND`.

## Implemented writes

Both endpoints require `Content-Type: application/json` and `X-User-Id: <positive integer>`.
The header selects a persisted demo user. It is not authentication. Identity must come from
this header; a `userId` field in the JSON body is rejected. Missing or invalid headers or
invalid bodies return `400 VALIDATION_ERROR`; a missing referenced user returns
`404 USER_NOT_FOUND`. Missing or unsupported content types return
`415 UNSUPPORTED_MEDIA_TYPE`. Malformed JSON returns `400 INVALID_JSON`.

### `POST /api/places/:id/reviews`

Body: `{ "rating": 5, "body": "A useful traveller review." }`.
Rating must be a JSON integer from 1 through 5. Review body must be a string containing
1 through 500 characters after trimming. Additional JSON fields are rejected.
One review is stored per user/place: first submission returns `201`; subsequent
submissions update that review and return `200`. The review ID and `createdAt` are
preserved on update; `updatedAt` records the submission time. The response is
`{ "data": <review with author and timestamps> }`, using the same review shape as place
details. An absent place returns `404 PLACE_NOT_FOUND`. Subsequent list/detail reads
reflect the persisted rating statistics. Existence checks, prior-review lookup, and upsert
run in one write transaction; missing users or places do not create a review.

### `POST /api/tour-slots/:id/bookings`

Body: `{ "seats": 2 }`. Seats must be a JSON safe integer greater than zero.
Additional JSON fields are rejected. An absent slot returns `404 SLOT_NOT_FOUND`.
The remaining-capacity check and insert run atomically against persisted bookings in
an immediate SQLite write transaction. Insufficient remaining capacity returns
`409 INSUFFICIENT_CAPACITY` without inserting any booking. A successful booking returns `201` and
`{ "data": { "id": 1, "slotId": 1, "userId": 1, "seats": 2, "createdAt": "..." } }`.
The success response is sent after the transaction commits. Missing users or slots also
leave bookings unchanged. A lock that outlasts the configured 5,000 ms busy timeout
returns `503 DATABASE_BUSY`, distinct from a full slot's `409` response.
Repeated valid submissions create separate bookings; no idempotency key is promised.

## Shared errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Malformed JSON request body. |
| 400 | `INVALID_QUERY` | Invalid or ambiguous place-list query. |
| 400 | `VALIDATION_ERROR` | Invalid ID, header, or domain input. |
| 404 | `PLACE_NOT_FOUND` | Requested place is absent. |
| 404 | `NOT_FOUND` | Route is not implemented or does not exist. |
| 404 | `USER_NOT_FOUND` / `SLOT_NOT_FOUND` | Referenced demo user or tour slot is absent. |
| 409 | `INSUFFICIENT_CAPACITY` | Requested seats exceed the slot's remaining capacity. |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body exceeds the 100 KiB limit. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Write request does not use `application/json`. |
| 415 | `UNSUPPORTED_ENCODING` | Unsupported request encoding or JSON charset. |
| 503 | `DATABASE_BUSY` | SQLite is busy or locked; a later retry may succeed. |
| 500 | `INTERNAL_ERROR` | Unexpected failure, with sanitized public details. |
