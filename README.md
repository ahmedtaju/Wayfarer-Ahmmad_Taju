# Wayfarer — Honest Ratings, Fair Bookings

Wayfarer is a full-stack city guide and tour booking application designed to solve two common platform flaws: misleading raw rating averages and tour overbooking under concurrent requests.

---

## 🛠️ Tech Stack & Workspace Architecture

* **Workspace Layout:**
  * `web/`: Next.js (App Router) + TypeScript + Tailwind CSS (Port 3000)
  * `api/`: Express API Server + SQLite (`@libsql/client`) + TypeScript (Port 3001)
  * Rewrites: Frontend `/api/*` requests forward automatically to the Express backend
* **Node.js Requirement:** `>= 20.0.0` (Verified on `Node.js v24.14.1`)
* **Test Runner:** Vitest

---

## 🚀 Getting Started (3-Command Reviewer Workflow)

After entering a fresh clone, run:

```bash
# 1. Install all dependencies across both workspaces from root
npm install

# 2. Setup and seed database (deterministic demo data)
npm run seed

# 3. Start both Express API and Next.js Frontend concurrently
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Next.js communicates with Express via `/api/*` rewrites.

---

## 🧪 Automated Testing (1 Command)

Run all unit, integration, and parallel concurrency tests once from root:

```bash
npm test
```

---

## 📋 Checkpoints & Progress Log

- [x] **Checkpoint 1:** Development tooling verified (Node.js version, SQLite driver, Vitest).
- [x] **Checkpoint 2:** Workspace structure (`web/` Next.js + `api/` Express), Express health endpoint, Next.js rewrites, and integration test.
- [ ] **Checkpoint 3:** Database model & repeatable seed data (Places, Reviews, Tour Slots, Users).
- [ ] **Checkpoint 4:** Honest Bayesian ranking formula implementation & unit tests.
- [ ] **Checkpoint 5:** Concurrency-safe atomic tour booking & parallel multi-process test harness.
- [ ] **Checkpoint 6:** Shared UI system, directory browser, and booking/review dialogs.
- [ ] **Checkpoint 7:** Final review and documentation audit.
