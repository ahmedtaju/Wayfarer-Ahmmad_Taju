# Wayfarer

A full-stack city guide for Addis Ababa with review-aware rankings and fair tour booking. Browse and filter places, read details and reviews, switch demo travellers, create or edit a review, and reserve tour seats. The interface uses the persisted API data throughout.

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
| `npm run lint` | Check API, frontend, scripts, and browser-test source with ESLint. |
| `npm run typecheck` | Check API and frontend TypeScript. |
| `npm run build` | Compile the API and create the Next.js production build. |
| `npm run test:e2e` | Run the real-browser journeys with installed Google Chrome. |
| `npm start` | Start both applications after building. |
| `npm run seed` | Explicitly reset and recreate demo data. |

Tests use separate temporary SQLite files. Coverage includes database constraints and connection settings, seed consistency and rollback, persistence after reopening, API responses and validation, ranking, city time labels, review upserts, and booking outcomes. A concurrency test starts two independent Express processes sharing one SQLite file and sends 20 parallel requests for the final seat: it asserts one confirmation, 19 capacity conflicts, and ten total persisted seats. A separate held-lock scenario checks `503`, release and successful retry, then `409` for the full slot. The test runner removes temporary files after its workers exit, including on Windows.

Frontend tests cover API error categories, request cancellation and stale responses, traveller persistence, URL filters, accessible dialogs, review drafts, booking conflicts, and uncertain write outcomes. The browser journeys exercise filtering and reloads, create/edit reviews, independent traveller selection across tabs, competing reservations, failed requests, keyboard access, and a narrower layout.

`npm run test:e2e` requires **Google Chrome** installed, using Playwright's `chrome` channel. Keep ports **3100** (Next.js) and **3101** (Express) free. The runner creates and seeds a private temporary SQLite database, starts its own development servers, and removes the file after they exit; it does not reset `api/data/wayfarer.db` or reuse existing servers. Next.js uses separate `.next-dev`, `.next-e2e`, and `.next` output directories for development, browser tests, and production, respectively.

Verified: **192 unit and integration tests** across 18 files, **six Chrome browser journeys**, ESLint without warnings, TypeScript checks, and both production builds pass. Browser checks include 1440 px, 900 px, and 375 px layouts. A separate Chrome smoke check against the compiled API and Next.js production server also verified proxy health, live directory cards, details, and tour availability without page errors.

## Using the guide

The directory provides History, Food, Nature, and all-place views, with top-rated or name ordering supplied by the backend. Category and sort are reflected in the URL, so a filtered view can be refreshed or shared. Cards show real raw rating averages and review counts; the ranking explanation describes the separate weighted ordering.

The header's **Acting as** selector starts with Sara, or restores a valid saved selection. The preference is stored in local storage; each open tab retains its own current actor and does not follow another tab's storage events. Switching travellers refreshes the relevant data and clears the previous traveller's open dialog state. This is demo identity selection, not authentication.

Place details show opening hours, authored reviews, and tour times in Addis Ababa time. The review dialog preloads the selected traveller's existing review, validates a 1–5 rating and 1–500 trimmed characters, and retains the draft after a failed request while it remains open. Drafts are not saved across closing, navigation, or reload.

The booking dialog supports a chosen slot and whole-number party size, disables full slots, and refreshes availability after a conflict. Success appears only after the server confirms a saved booking. If a response is lost or a proxy cannot confirm the write outcome, the dialog blocks another submission and explains that the booking may have been saved. Refreshing availability sends only a read; it cannot prove which traveller owns a booking. Writes are never automatically retried.

Loading, empty, missing-place, failed-request, and retry states are explicit. Dialogs provide labelled controls, keyboard focus containment, Escape dismissal when idle, and focus restoration. Local category images from the supplied design reference are illustrative rather than verified photographs of each listed place; a local placeholder and system fonts avoid runtime image or font CDN dependencies. See the [image notes](web/public/images/README.md).

## Screenshots

Browser journeys produce [the directory](docs/screenshots/directory.png), [place details](docs/screenshots/place-details.png), and [a booking confirmation](docs/screenshots/booking-confirmed.png).

## Structure

```text
api/src/
  db/          Connection setup, schema, demo fixtures, and explicit seed
  routes/      Express HTTP endpoints
  services/    Place queries, ranking, review upserts, and atomic booking
  http/        Shared input validation and error handling
  lib/         Shared city time formatting
  __tests__/   Unit and database-backed integration tests
web/src/       Next.js pages, shared components, request hooks, and frontend tests
web/e2e/       Playwright journeys against running applications
docs/screenshots/  Screenshots captured from browser journeys
```

The default database is `api/data/wayfarer.db`. An optional `WAYFARER_DB_PATH` process environment variable selects another file; relative paths always resolve from `api/`, regardless of the working directory. No `.env` file is required or automatically loaded. Generated databases and build output are excluded from Git.

## API and ranking

The implemented operations are `GET /api/users`, `GET /api/places`, `GET /api/places/:id`, `POST /api/places/:id/reviews`, and `POST /api/tour-slots/:id/bookings`, alongside `GET /api/health`. Category filtering and sorting happen on the backend. The [API contract](api/CONTRACT.md) defines response fields, query parameters, write inputs, and error outcomes.

Place details include reviews with author identity, opening hours, and tour availability. Slots preserve UTC timestamps and include labels in the explicit `Africa/Addis_Ababa` time zone. Write requests use a persisted demo user selected through `X-User-Id`; this is a demonstration identity mechanism, not authentication. A user can create or update one review per place. Booking checks remaining capacity and inserts seats in the same SQLite write transaction, confirming success only after commit.

Top-rated sorting uses `(totalStars + 17.5) / (reviewCount + 5)`: five starting reviews averaging 3.5 stars. The museum's ratings of 5, 5, and 4 score **3.9375**, above a new café's single five-star review at **3.75**. Raw averages remain separate from ranking scores. Unrated places appear last; equal scores use name and then ID for consistent ordering.

## Current scope

The five entities and their relationships are implemented, including one review per user/place, foreign keys, integer/range constraints, and derived review and booking totals. Reviews preserve their ID and creation time when updated. Booking uses persisted seat totals without a duplicate availability counter; insufficient capacity returns `409`, while database contention returns `503` after the configured lock wait.

After a busy or locked database error, the affected connection is discarded and the next operation opens a fresh connection with the same integrity settings. Failed bookings are not automatically retried.

The two pages and two dialogs are implemented with responsive layouts. Demo user selection provides no authentication. There is no payment, cancellation, booking-history, or idempotency workflow; repeated successful booking submissions create separate bookings. SQLite keeps this exercise self-contained; broader scaling, production deployment configuration, and incremental schema migrations remain future work.

See [DECISIONS.md](DECISIONS.md) for implementation choices and [AI_USAGE.md](AI_USAGE.md) for recorded assistance and corrections.
