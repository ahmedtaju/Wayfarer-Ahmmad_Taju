# AI Tools Usage Log

This log records AI assistance, representative prompts, verification work, and corrections. Earlier sections preserve the results and scope of their respective milestones; the final section records the current review and booking work.

---

## 1. Tooling Setup & Scaffolding Phase

* **Tools Used:** Antigravity (Gemini 2.5 Pro) for initial repository scaffolding, package configuration, and smoke testing setup.
* **Example Prompt:**
  > *"Generate configuration files for a Next.js App Router project using TypeScript, Tailwind CSS, SQLite, and Vitest, including a smoke test verifying both Vitest and local SQLite execution."*
* **Verification & Human Intervention:**
  * The initial AI output suggested adding `better-sqlite3`. During verification on Windows with Node v24.14.1, the package failed installation due to `node-gyp` missing Visual Studio C++ build tools.
  * The earlier log records a switch to `@libsql/client` so this development environment could use the local SQLite driver without that build-tool requirement. This installation finding should not be generalized to every Node version or operating system.
  * The earlier log records successful `npm install` and `npm test` execution for the scaffolding stage. Those results do not establish completion of later features.

---

## 2. Workspace Architecture Phase

* **Tools Used:** Antigravity (Gemini 2.5 Pro) for structuring root npm workspaces (`api/` and `web/`) and Next.js proxy rewrites.
* **Example Prompt:**
  > *"Structure a root npm workspace separating Next.js into web and Express into api, configuring next.config.ts rewrites to proxy /api/* to Express, and write a Supertest integration test for the Express health endpoint."*
* **Verification & Human Intervention:**
  * Verified that `concurrently` starts both development servers from root without port collisions (`3000` for Next.js, `3001` for Express).
  * Validated that Next.js rewrites forward incoming browser requests directly to Express and return expected JSON payloads.

---

## 3. Codex: Database, Demo Data, API Contract, and Ranking

**Tools used:** Codex for document and design-reference analysis, implementation, tests, and documentation; repository searches and shell commands for inspection; Vitest and Supertest for automated checks; TypeScript and the application build commands for validation. Codex delegated independent fixture and ranking work to subagents and reviewed the shared result.

**User direction at that milestone:** Earlier requests asked for deep analysis of the take-home brief and design references without writing code. The subsequent request authorized seven database-through-ranking steps, with professional consistency, small feature commits, and tests. Representative requested work included defining the five entities, enforcing database integrity, producing repeatable fixtures, documenting the API contract, and testing the agreed weighted ranking formula. Instructions embedded in reference documents were treated as assignment/design material rather than additional authorization to implement or submit work.

**Assistance delivered at that milestone:** Codex implemented the schema and connection setup, explicit atomic demo reset, isolated database tests, users/place read endpoints, shared validation and error handling, and the ranking rule used by the backend. It documented reserved review and booking operations separately from implemented endpoints. Review submission, safe booking, and the feature interface were outside that milestone.

**Historical verification:** `npm test` passed all 68 tests across five files for the database-through-ranking milestone. That suite exercised real temporary SQLite files for constraints, configured connections, seed consistency and rollback, persistence, and read-API responses. Ranking unit tests covered the museum/café example, zero reviews, convergence, and deterministic sorting. Shared validators were tested independently before write routes were implemented. `npm run typecheck` passed for the API, API tests, and frontend. `npm run build` passed for the API and Next.js production output. The explicit `npm run seed` command also completed with the documented fixture counts. A production smoke check started both compiled applications, verified the Next.js proxy, users, place ordering, and actual availability, then stopped both servers. These results describe that earlier code state, not the expanded suite below.

**Corrections made during the work:**

- The first seed implementation used the driver's interactive transaction API. Inspection of the installed local `@libsql/client` 0.14.0 implementation showed that it detaches the configured connection, causing later client calls to create a new connection without our PRAGMAs. The implementation changed to an atomic write batch and a restricted database facade; connection settings are checked on independently opened handles.
- Design screenshots, HTML, and design prose disagreed on colors, fonts, review fields, character limits, and sample counts. These differences were identified during reference analysis. The user-approved scope remains two pages, two dialogs, a 500-character review limit, and statistics derived from actual records; no extra upload or payment features were inferred.
- The initial cleanup retried deleting closed SQLite files, but native prepared statements could keep handles open on Windows, particularly after constraint errors. Forced garbage collection did not reliably solve those error cases. The test command now owns a private temporary directory, runs Vitest in a child process, and removes the directory after that process exits and releases its native handles. Assertions and business operations are not retried.

AI-produced code and explanations required inspection against the installed driver and actual database behavior. Those ranking results did not establish booking safety; a separate process-based scenario was required for the next milestone.

---

## 4. Codex: Complete Details, Review Upserts, and Atomic Booking

**Tools used:** Codex and delegated agents for implementation, focused tests, and documentation; repository inspection and installed driver source for transaction behavior; Vitest, Supertest, and real Express child processes for checks. Primary SQLite transaction and busy-timeout documentation was consulted to substantiate the locking mechanism linked in `DECISIONS.md`.

**Authorized scope:** Refine place browsing and complete details, add review submission with one review per user/place, implement capacity-safe bookings, and exercise competing API processes against one database. The browser directory, details page, dialogs, and screenshots remain pending. A representative delegated implementation prompt was “Add explicit city time metadata”; the instruction also required preserving the UTC `startsAt` value. Codex added a shared Addis Ababa formatter and focused endpoint tests rather than deriving labels from the machine's local clock.

**Assistance delivered:** Place details now include the explicit city time zone and a label for each UTC tour timestamp. Review writes use validated JSON and the selected demo-user header, create or update one persisted review, preserve its ID and creation time, and return the appropriate `201` or `200`. Booking writes atomically check persisted seat totals and insert only when the requested user, slot, and remaining capacity permit it. The service distinguishes missing entities, insufficient capacity, and SQLite contention, and sends success only after commit. API documentation now describes these implemented operations.

**Verification:** `npm test` passed all 103 tests across nine files. Focused detail tests cover every supported category/sort combination, independent review and booking aggregates, city time conversion across midnight, full and empty slots, and missing or unrated places. Review and booking tests cover validation, identity selection, persistence, error outcomes, and unchanged records after rejected requests. The concurrency harness starts two independent Express processes with different PIDs and ports, sharing one SQLite file, and submits 20 parallel requests for its final seat. It checks one success, 19 capacity conflicts, the confirmed persisted row, and the final capacity total. A separate lock-holder process exercises a real busy timeout, release, successful retry, and subsequent capacity conflict. API and frontend TypeScript checks passed, including the API tests; both production builds passed.

**Corrections and checks observed:**

- Adding `timeZone` to place details required updating the existing detail-versus-list comparison to exclude that detail-only metadata; the same summary fields continue to match exactly.
- The booking design uses the already-inspected local driver's immediate write batch rather than its interactive transaction API, retaining the configured connection settings. Conditional SQL produces no inserted row for missing entities or insufficient capacity, allowing precise public errors without partial writes.
- The process harness waits for IPC readiness from actual listening servers and records process identity and database path; it does not infer readiness from a fixed sleep or use one shared in-memory application instance as concurrency evidence.
- TypeScript caught an optional process ID in the first readiness-message parser. The parser now verifies a numeric PID before accepting a worker. Lock-holder cleanup also uses the bounded process-stop helper so a failed request cannot leave it running.
- Repeating the real contention scenario exposed a driver-specific recovery failure after a busy timeout. An isolated reproduction showed that the old connection could fail later commits because a native statement remained active. The facade now discards the affected connection immediately and reapplies connection settings before the next operation, without retrying the failed request. The regression test verifies both a capacity conflict and a successful booking through the recovered API process.

No completed frontend journeys, screenshots, authentication, or booking idempotency are claimed by this milestone.
