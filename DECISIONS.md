# Technical Decisions Log

This document records architectural, mathematical, and implementation decisions made throughout the development of Wayfarer.

---

## 1. Tooling & Environment Decisions

### Full-Stack Architecture
* **Decision:** Next.js (App Router) with TypeScript.
* **Rationale:** Next.js App Router provides unified client and server execution in a single TypeScript project. API Route Handlers eliminate the need for multi-process choreography or external reverse proxies, ensuring the application starts reliably from a fresh clone with a single command.

### Database Engine & Driver Evaluation
* **Requirement:** Fast, file-based SQLite database with zero external setup.
* **Driver Evaluation & Finding:**
  * Initially evaluated `better-sqlite3`. On modern Node.js versions (e.g. Node 24 on Windows), `better-sqlite3` lacks precompiled binaries and requires local C++ compilation via `node-gyp` and Visual Studio build tools. This introduces cross-platform installation fragility for reviewers.
  * Selected `@libsql/client` (Turso's modern SQLite client). It provides precompiled, native N-API binaries across all operating systems, fully supports local SQLite files (`file:data/wayfarer.db`), transactions, WAL mode, and parameterized queries without any C++ compilation requirement.

### Testing Framework
* **Decision:** Vitest.
* **Rationale:** Vitest provides sub-second execution speeds, native TypeScript support without `ts-jest` compilation overhead, and seamless integration with the Node.js test environment.

---

## 2. Upcoming Architectural Milestones

* **Honest Ranking:** Formulate a Bayesian damped mean to address the single 5★ review anomaly without arbitrary threshold cliffs.
* **Anti-Overbooking:** Implement database-level atomic conditional updates with idempotency locks to guarantee zero overbooking under simultaneous requests.

