# Wayfarer

A city guide for Addis Ababa with review-aware rankings and tour availability. The backend implements repeatable demo data, filtered place browsing, complete place details, review upserts, and atomic tour booking. The feature interface remains the next milestone.

## Run locally

Prerequisites: Node.js 20 or later and npm. Run these three commands from the repository root:

```bash
npm install
npm run seed
npm run dev
```

The frontend runs at [localhost:3000](http://localhost:3000); Express runs at [localhost:3001](http://localhost:3001). Next.js forwards `/api/*` requests to Express, so both applications start from one terminal.

**`npm run seed` deliberately resets all five demo tables, replacing existing users, places, reviews, tour slots, and bookings.** The reset is atomic: a failed insertion rolls back the reset. Normal application startup only initializes missing tables and preserves existing data; it never seeds automatically.

The seed contains Sara, Abel, and Liya; ten places across History, Food, and Nature; 20 reviews; five tour slots; and seven bookings totaling 29 seats. It includes slots with four, one, and zero seats available, plus places without tours. Dates are generated in the future at seed time, at 09:00 in Addis Ababa. Opening hours and reviews are illustrative demo data.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the automated suite once and exit. |
| `npm run typecheck` | Check API and frontend TypeScript. |
| `npm run build` | Compile the API and create the Next.js production build. |
| `npm start` | Start both applications after building. |
| `npm run seed` | Explicitly reset and recreate demo data. |

Tests use separate temporary SQLite files. Coverage includes database constraints and connection settings, seed consistency and rollback, persistence after reopening, API responses and validation, ranking, city time labels, review upserts, and booking outcomes. A concurrency test starts two independent Express processes sharing one SQLite file and sends 20 parallel requests for the final seat: it asserts one confirmation, 19 capacity conflicts, and ten total persisted seats. A separate held-lock scenario checks `503`, release and successful retry, then `409` for the full slot. The test runner removes temporary files after its workers exit, including on Windows.

The current suite has 103 passing tests across nine files. TypeScript checks and both production builds also pass.

## Structure

```text
api/src/
  db/          Connection setup, schema, demo fixtures, and explicit seed
  routes/      Express HTTP endpoints
  services/    Place queries, ranking, review upserts, and atomic booking
  http/        Shared input validation and error handling
  lib/         Shared city time formatting
  __tests__/   Unit and database-backed integration tests
web/           Next.js pages, components, and frontend configuration
```

The default database is `api/data/wayfarer.db`. An optional `WAYFARER_DB_PATH` process environment variable selects another file; relative paths always resolve from `api/`, regardless of the working directory. No `.env` file is required or automatically loaded. Generated databases and build output are excluded from Git.

## API and ranking

The implemented operations are `GET /api/users`, `GET /api/places`, `GET /api/places/:id`, `POST /api/places/:id/reviews`, and `POST /api/tour-slots/:id/bookings`, alongside `GET /api/health`. Category filtering and sorting happen on the backend. The [API contract](api/CONTRACT.md) defines response fields, query parameters, write inputs, and error outcomes.

Place details include reviews with author identity, opening hours, and tour availability. Slots preserve UTC timestamps and include labels in the explicit `Africa/Addis_Ababa` time zone. Write requests use a persisted demo user selected through `X-User-Id`; this is a demonstration identity mechanism, not authentication. A user can create or update one review per place. Booking checks remaining capacity and inserts seats in the same SQLite write transaction, confirming success only after commit.

Top-rated sorting uses `(totalStars + 17.5) / (reviewCount + 5)`: five starting reviews averaging 3.5 stars. The museum's ratings of 5, 5, and 4 score **3.9375**, above a new café's single five-star review at **3.75**. Raw averages remain separate from ranking scores. Unrated places appear last; equal scores use name and then ID for consistent ordering.

## Current scope

The five entities and their relationships are implemented, including one review per user/place, foreign keys, integer/range constraints, and derived review and booking totals. Reviews preserve their ID and creation time when updated. Booking uses persisted seat totals without a duplicate availability counter; insufficient capacity returns `409`, while database contention returns `503` after the configured lock wait.

After a busy or locked database error, the affected connection is discarded and the next operation opens a fresh connection with the same integrity settings. Failed bookings are not automatically retried.

The current frontend is the existing application shell. The directory, details page, review and booking dialogs, and screenshots will follow the backend milestones. Demo user selection will not provide authentication. SQLite keeps this exercise self-contained; scaling, deployment configuration, and schema migrations remain future work.

See [DECISIONS.md](DECISIONS.md) for implementation choices and [AI_USAGE.md](AI_USAGE.md) for recorded assistance and corrections.
