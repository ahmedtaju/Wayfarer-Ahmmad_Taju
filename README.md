# Wayfarer — Honest Ratings, Fair Bookings

Wayfarer is a full-stack city guide and tour booking application designed to solve two common platform flaws: misleading raw rating averages and tour overbooking under concurrent requests.

---

## 🛠️ Tech Stack & Environment

* **Node.js:** `>= 20.0.0` (Tested & verified on `Node.js v24.14.1`)
* **Framework:** Next.js (App Router) + TypeScript
* **Styling:** Tailwind CSS
* **Database Driver:** SQLite via `@libsql/client` (Zero external daemon; native cross-platform precompiled driver)
* **Test Runner:** Vitest

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Verify Tooling Checkpoint & Database Driver
```bash
npm test
```

### 3. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📋 Progress Log & Checkpoints

- [x] **Checkpoint 1:** Development tooling verified (Next.js App Router, Tailwind, SQLite driver, Vitest, Git setup).
- [ ] **Checkpoint 2:** Database schema & seed data (Places, Reviews, Tour Slots, Users).
- [ ] **Checkpoint 3:** Honest Bayesian ranking formula implementation & unit tests.
- [ ] **Checkpoint 4:** Atomic tour booking & parallel concurrency test.
- [ ] **Checkpoint 5:** Backend API endpoints & interactive master-detail UI.
- [ ] **Checkpoint 6:** Final documentation review (`DECISIONS.md`, `AI_USAGE.md`).
