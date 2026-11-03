# Technical decisions

## Architecture and data

Root npm workspaces separate Next.js (`web/`) from Express (`api/`) while retaining one installation, startup, and test entry point. Next.js proxies `/api/*`; the [API contract](api/CONTRACT.md) defines validated inputs, camelCase responses, and sanitized errors.

Five SQLite `STRICT` tables represent users, places, reviews, tour slots, and bookings. Foreign keys preserve relationships; `UNIQUE(place_id, user_id)` allows one review per traveller/place. Checks enforce supported categories, integer ratings from 1–5, trimmed review lengths from 1–500, and positive safe integer capacities/seats. Parameterized SQL complements API validation.

Review counts, raw averages, and booked seats derive from source records rather than duplicate counters. Reviews and bookings aggregate independently, avoiding multiplied joins. Details read their summary, authors, and slots in one snapshot. UTC slot timestamps remain unchanged; a shared formatter adds labels in `Africa/Addis_Ababa`, including calendar-day changes.

## Honest ranking

The backend uses `(totalStars + 17.5) / (reviewCount + 5)`: five prior reviews averaging 3.5 reduce sparse-rating bias. A single five-star café review scores **3.75**; museum ratings of 5, 5, and 4 score **3.9375**. With more evidence, scores approach the observed average. Sorting compares unrounded scores, puts unrated places last, and breaks ties by ascending name then ID using deterministic string comparisons. Raw averages remain separate for display.

## Transactions and recovery

The installed `@libsql/client` 0.14.0 local driver's interactive `transaction()` detaches its configured connection. The facade therefore exposes only `execute` and `batch`. Its `batch(..., "write")` starts `BEGIN IMMEDIATE`, executes statements synchronously on that connection, and resolves after commit; failures roll back. SQLite permits one writer, so acquiring that transaction precedes the capacity check. [SQLite transactions](https://www.sqlite.org/lang_transaction.html#deferred_immediate_and_exclusive_transactions)

Review batches check user, place, and prior state, then use guarded `INSERT ... SELECT ... ON CONFLICT` to create or update. Updates preserve ID/creation time; prior state selects `201` or `200` after commit. Booking batches join the requested user/slot and insert only when capacity minus persisted booking seats covers the request. Missing entities insert nothing and return `404`; insufficient capacity returns `409`; committed success returns `201`. SQLite supplies cross-process safety.

Each connection enables and verifies foreign keys and applies a 5,000 ms busy timeout; relative paths resolve from `api/`. Expired contention returns `503`, distinct from full capacity. [SQLite busy timeout](https://www.sqlite.org/pragma.html#pragma_busy_timeout)

A reproduction exposed retained native statements after timeout, which could poison later commits. The facade discards the affected connection and reapplies its PRAGMAs on reopening before the next operation. It never automatically retries failed requests. A per-handle queue coordinates recovery; it is not the capacity-safety guarantee.

## Demo data and evidence

Explicit seeding destructively resets all five tables atomically: three users, ten places, 20 reviews, five future slots, and seven bookings. Stable IDs and an injectable clock support repeatability; tours start at 09:00 Addis Ababa time. Startup initializes missing schema without reseeding, preserving changes.

The concurrency test runs two real Express processes sharing one temporary file. Twenty parallel final-seat requests must produce one confirmation, 19 conflicts, one inserted row, and ten total booked seats. A separate held-lock process checks real `503`, release, and correct conflict/success responses through the recovered server. Temporary files are removed after workers exit.

## Remaining scope

Frontend pages, dialogs, and screenshots remain pending. Demo-user headers provide no authentication. Booking idempotency, production deployment, broader scaling, and incremental migrations remain outside this milestone; repeated successful booking requests create separate bookings.
