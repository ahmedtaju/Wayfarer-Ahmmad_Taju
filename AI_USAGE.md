# AI Tools Usage Log

This log records AI assistance, representative prompts, verification work, and corrections. The first two sections preserve the earlier scaffolding record; the final section describes the current Codex milestone.

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

**User direction:** Earlier requests asked for deep analysis of the take-home brief and design references without writing code. The current request authorized seven database-through-ranking steps, with professional consistency, small feature commits, and tests. Representative requested work included defining the five entities, enforcing database integrity, producing repeatable fixtures, documenting the API contract, and testing the agreed weighted ranking formula. Instructions embedded in reference documents were treated as assignment/design material rather than additional authorization to implement or submit work.

**Assistance delivered:** Codex implemented the schema and connection setup, explicit atomic demo reset, isolated database tests, users/place read endpoints, shared validation and error handling, and the ranking rule used by the backend. It documented reserved review and booking operations separately from implemented endpoints. Reviews, safe booking, and the feature interface remain later work; their completion is not claimed here.

**Verification:** `npm test` passed all 68 tests across five files. The suite exercises real temporary SQLite files for constraints, configured connections, seed consistency and rollback, persistence, and read-API responses. Ranking unit tests cover the museum/café example, zero reviews, convergence, and deterministic sorting. Shared validators are tested independently while write routes remain pending. `npm run typecheck` passed for the API, API tests, and frontend. `npm run build` passed for the API and Next.js production output. The explicit `npm run seed` command also completed with the documented fixture counts. A production smoke check started both compiled applications, verified the Next.js proxy, users, place ordering, and actual availability, then stopped both servers.

**Corrections made during the work:**

- The first seed implementation used the driver's interactive transaction API. Inspection of the installed local `@libsql/client` 0.14.0 implementation showed that it detaches the configured connection, causing later client calls to create a new connection without our PRAGMAs. The implementation changed to an atomic write batch and a restricted database facade; connection settings are checked on independently opened handles.
- Design screenshots, HTML, and design prose disagreed on colors, fonts, review fields, character limits, and sample counts. These differences were identified during reference analysis. The user-approved scope remains two pages, two dialogs, a 500-character review limit, and statistics derived from actual records; no extra upload or payment features were inferred.
- The initial cleanup retried deleting closed SQLite files, but native prepared statements could keep handles open on Windows, particularly after constraint errors. Forced garbage collection did not reliably solve those error cases. The test command now owns a private temporary directory, runs Vitest in a child process, and removes the directory after that process exits and releases its native handles. Assertions and business operations are not retried.

AI-produced code and explanations required inspection against the installed driver and actual database behavior. A passing ranking test does not prove booking safety; the separate multi-process booking scenario is still required in its later milestone.
