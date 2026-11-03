# Technical decisions

## Workspace and API boundary

Root npm workspaces keep Next.js in `web/` and Express in `api/` while providing one installation, startup, and test entry point. HTTP routes, business logic, database setup, fixtures, and tests have separate locations. Next.js rewrites the frontend's `/api/*` requests to Express. The [API contract](api/CONTRACT.md) distinguishes implemented reads from planned writes and defines a consistent JSON error shape.

## SQLite model and integrity

Five `STRICT` tables represent users, places, reviews, tour slots, and bookings. Reviews reference a place and user; slots reference a place; bookings reference a particular slot and user. Foreign keys restrict deletion of referenced records. A unique `(place_id, user_id)` constraint prevents duplicate reviews. Checks limit ratings to 1–5, review text to 1–500 trimmed characters, categories to the three supported values, and capacity/seats to positive safe integer ranges. API validators also reject fractional values and numeric strings.

Review counts, average ratings, and booked-seat totals are calculated from source records rather than stored as duplicate counters. Review aggregation is independent of booking aggregation, preventing joins from multiplying records. Place details use one read snapshot for their summary, reviews, and slots.

Every opened database handle enables and verifies foreign-key enforcement and sets a 5,000 ms busy timeout. Relative paths resolve from `api/`, including in compiled output. Temporary contention maps to `503 DATABASE_BUSY`; unexpected failures use sanitized `500` responses through Express error middleware.

## Driver and transaction boundaries

The earlier setup selected `@libsql/client` after `better-sqlite3` installation failed on this Windows/Node environment without Visual Studio C++ build tools. This is a local installation finding, not a claim that either driver behaves identically on every platform.

Inspection of the installed `@libsql/client` 0.14.0 local driver revealed that interactive `transaction()` detaches its connection from the client. Later client calls create another connection, without reapplying our connection-specific PRAGMAs. The database facade therefore exposes only `execute` and `batch`. Schema initialization and seeding use `batch(..., "write")`, which uses an immediate transaction and rolls back on failure while retaining the configured connection. This choice needs revisiting when implementing conditional booking writes.

## Explicit, repeatable demo data

Seeding deliberately replaces all records in the five demo tables in one atomic batch. Stable IDs and a supplied clock make fixtures testable; default execution generates future tour dates at 09:00 Addis Ababa time, stored as UTC timestamps. The dataset has three users, ten places, 20 reviews, five slots, and seven bookings totaling 29 seats. Opening hours are illustrative.

Startup initializes the schema without reseeding. Tests use isolated temporary files and cover reset behavior, rollback, persistence, valid relationships, and capacity-consistent fixtures. The seed's destructive behavior is explicit in the README.

## Honest ranking

`calculateRanking` is the single rule used by the actual backend: `(totalStars + 17.5) / (reviewCount + 5)`. Five prior reviews averaging 3.5 reduce the effect of sparse evidence. A single five-star review scores 3.75; ratings of 5, 5, and 4 score 3.9375. As review volume grows, the score approaches the observed average.

Sorting uses full precision. Unrated places follow rated places; ties use ascending name and then ID with deterministic string comparisons. Raw averages remain distinct for later rounded display. Tests cover the motivating example, zero reviews, convergence, validation, and ordering.

## Remaining guarantees

Review upserts, an atomic capacity check and booking insertion, and a multi-process booking test remain pending. Positive-seat constraints alone do not prevent aggregate overbooking. The future implementation must prove that competing API processes sharing one database cannot oversell a slot. Authentication, booking idempotency, production deployment, and an incremental migration system are outside this milestone.
