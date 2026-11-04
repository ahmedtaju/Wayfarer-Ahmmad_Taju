# Technical decisions

## Architecture and data

Root npm workspaces separate Next.js (`web/`) from Express (`api/`) with shared install, startup, and test commands. Next.js proxies `/api/*`; the [API contract](api/CONTRACT.md) defines inputs, camelCase responses, and sanitized errors.

Five SQLite `STRICT` tables represent users, places, reviews, slots, and bookings. Foreign keys preserve relationships; `UNIQUE(place_id, user_id)` enforces one review per traveller/place. Checks enforce categories, integer ratings 1–5, trimmed review lengths 1–500, and positive safe integer capacities/seats. SQL parameters complement input validation.

Rating statistics and booked seats derive from source records; independent aggregates avoid multiplied joins. Details use one read snapshot. UTC timestamps remain unchanged; shared formatting adds `Africa/Addis_Ababa` labels, including calendar-day changes.

## Honest ranking

The backend uses `(totalStars + 17.5) / (reviewCount + 5)`: five prior reviews averaging 3.5 reduce sparse-rating bias. One five-star café review scores **3.75**; museum ratings 5, 5, and 4 score **3.9375**. Scores approach the observed average as evidence grows. Sorting compares unrounded scores, places unrated entries last, then breaks ties by name and ID using deterministic string comparisons. Raw averages remain separate for display.

## Transactions and recovery

The installed `@libsql/client` 0.14.0 local driver's interactive `transaction()` detaches its configured connection. The facade exposes only `execute` and `batch`. Its write batch starts `BEGIN IMMEDIATE`, executes synchronously on that connection, and resolves after commit; failures roll back. SQLite's single-writer transaction precedes the capacity check. [SQLite transactions](https://www.sqlite.org/lang_transaction.html#deferred_immediate_and_exclusive_transactions)

Review batches check user, place, and prior state, then guarded `INSERT ... SELECT ... ON CONFLICT` creates or updates, preserving ID/creation time. Prior state determines `201`/`200` after commit. Booking joins the requested user/slot and inserts only if capacity minus persisted booked seats covers the request. Missing entities return `404` without inserts; insufficient capacity returns `409`; committed success returns `201`.

Connections verify foreign keys, apply a 5,000 ms busy timeout, and resolve relative paths from `api/`. Expired contention returns `503`. [SQLite busy timeout](https://www.sqlite.org/pragma.html#pragma_busy_timeout)

A reproduction exposed retained native statements after timeout. Recovery discards that connection and reapplies PRAGMAs when reopening before the next operation, without automatically retrying failed requests. A per-handle queue coordinates recovery; SQLite supplies cross-process capacity safety.

## Frontend behavior

URL category/sort state supports reloadable views. Local storage provides an initial traveller preference; current selection stays independent in each tab. Request cancellation, generations, and actor/path keys prevent stale responses or captured reloads from replacing current data.

Dialogs retain drafts only while open, manage keyboard focus, and refresh derived statistics after writes. A failed post-write refresh reports that the action was saved; it never repeats the write. Conflicts refresh availability; lost or proxy write responses remain unknown and block resubmission. Availability reads cannot establish booking ownership. A short pre-hydration cleanup handles only the specific extension marker attributes seen in the provided browser report, with a bounded startup observer; other app markup and React diagnostics remain intact. Category images are illustrative local reference assets with local placeholders/system fonts, avoiding runtime image/font CDNs.

## Demo data and evidence

Explicit seeding destructively resets all five tables atomically: three users, ten places, 20 reviews, five future slots, and seven bookings. Stable IDs and an injectable clock support repeatability. Startup initializes schema without reseeding.

Two real Express processes share one temporary file: 20 parallel final-seat requests must yield one confirmation, 19 conflicts, one inserted row, and ten booked seats. A separate lock-holder checks `503`, release, and recovered conflict/success responses. Chrome journeys use isolated data, output, and ports 3100/3101; they exercise complete UI flows, keyboard access, and screenshots. Files are cleaned after workers exit. Development, browser tests, and production use separate Next.js output directories to prevent interference.

## Limits

Demo identity is not authentication. Draft persistence, booking history, cancellation, payments, idempotency, production deployment, broader scaling, and incremental migrations remain outside scope. Repeated successful booking submissions create separate bookings.
