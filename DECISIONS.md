# Technical Decisions Log

This document records architectural, mathematical, and implementation decisions made throughout the development of Wayfarer.

---

## 1. Tooling & Workspace Architecture

### Split Workspace (`web` and `api`)
* **Decision:** Separate the repository into `web/` (Next.js App Router) and `api/` (Express) managed via root npm workspaces.
* **Rationale:**
  * Clean separation of concerns: Backend business logic, transactions, SQLite operations, and test processes live strictly in `api/`. Presentation logic, layout, Tailwind styling, and routing live strictly in `web/`.
  * Reviewers can still run `npm install`, `npm run dev`, and `npm test` from the root repository without managing multiple terminals.
* **Frontend-to-Backend Connectivity:**
  * Next.js App Router uses `rewrites()` in `next.config.ts` to proxy all `/api/*` traffic transparently to `http://localhost:3001/api/*`.
  * Eliminates CORS complexity in production and preserves a consistent `/api/*` request contract across browser clients.

### Database Engine & Driver Evaluation
* **Requirement:** Fast, file-based SQLite database with zero external setup.
* **Driver Evaluation & Finding:**
  * Initially evaluated `better-sqlite3`. On modern Node.js versions (e.g. Node 24 on Windows), `better-sqlite3` lacks precompiled binaries and requires local C++ compilation via `node-gyp` and Visual Studio build tools. This introduces cross-platform installation fragility for reviewers.
  * Selected `@libsql/client` (Turso's modern SQLite client). It provides precompiled, native N-API binaries across all operating systems, fully supports local SQLite files (`file:data/wayfarer.db`), transactions, WAL mode, and parameterized queries without any C++ compilation requirement.

### Testing Framework
* **Decision:** Vitest.
* **Rationale:** Vitest provides sub-second execution speeds, native TypeScript support without compilation overhead, and unified multi-package test execution from repository root via `npm test`.

---

## 2. Upcoming Architectural Milestones

* **Database Model & Integrity Rules:** Define 5 entities with SQLite foreign-key enforcement and unique constraint on `(place_id, user_id)` for review upserts.
* **Honest Ranking:** Formulate the weighted formula $(S = \frac{\text{stars} + 17.5}{\text{count} + 5})$ representing 5 initial reviews at 3.5 stars.
* **Safe Booking Concurrency:** Immediate database transaction (`BEGIN IMMEDIATE`) with multi-process parallel testing.
