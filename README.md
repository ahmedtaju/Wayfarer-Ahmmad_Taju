# Wayfarer

A city guide for Addis Ababa with review-aware rankings and tour availability. This milestone implements the database, repeatable demo data, read API, and tested ranking rule. Review submission, concurrency-safe booking, and the feature interface are the next milestones.

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

Tests use separate temporary SQLite files. Coverage includes database constraints and connection settings, seed consistency and rollback, persistence after reopening, API responses and validation, and ranking behavior. The multi-process booking test belongs to the upcoming booking milestone.

## Structure

```text
api/src/
  db/          Connection setup, schema, demo fixtures, and explicit seed
  routes/      Express HTTP endpoints
  services/    Place queries and ranking logic
  http/        Shared input validation and error handling
  __tests__/   Unit and database-backed integration tests
web/           Next.js pages, components, and frontend configuration
```

The default database is `api/data/wayfarer.db`. An optional `WAYFARER_DB_PATH` process environment variable selects another file; relative paths always resolve from `api/`, regardless of the working directory. No `.env` file is required or automatically loaded. Generated databases and build output are excluded from Git.

## API and ranking

The implemented operations are `GET /api/users`, `GET /api/places`, and `GET /api/places/:id`, alongside `GET /api/health`. Category filtering and sorting happen on the backend. The [API contract](api/CONTRACT.md) defines response fields, query parameters, error outcomes, and the reserved review and booking operations.

Top-rated sorting uses `(totalStars + 17.5) / (reviewCount + 5)`: five starting reviews averaging 3.5 stars. The museum's ratings of 5, 5, and 4 score **3.9375**, above a new café's single five-star review at **3.75**. Raw averages remain separate from ranking scores. Unrated places appear last; equal scores use name and then ID for consistent ordering.

## Current scope

The five entities and their relationships are implemented, including one review per user/place, foreign keys, integer/range constraints, and derived review and booking totals. The API reports actual tour availability, but the booking endpoint and its concurrency guarantee have not been implemented yet. Shared write-input validators are ready; review upserts, booking writes, and their browser journeys remain pending.

The current frontend is the existing application shell. The directory, details page, review and booking dialogs, and screenshots will follow the backend milestones. Demo user selection will not provide authentication. SQLite keeps this exercise self-contained; scaling, deployment configuration, and schema migrations remain future work.

See [DECISIONS.md](DECISIONS.md) for implementation choices and [AI_USAGE.md](AI_USAGE.md) for recorded assistance and corrections.
