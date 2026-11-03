# AI Tools Usage Log

I used AI assistance throughout the project to speed up boilerplate setup and explore implementation ideas, while reviewing and verifying all generated code myself.

## 1. Tools Used
- **Antigravity (Gemini 3.6 Pro)**: Used for initial monorepo scaffolding (Next.js + Express workspaces), drafting initial TypeScript interfaces, and exploring styling ideas.
- **Claude 3.5 Sonnet**: Used for sanity-checking SQLite transaction semantics, edge case brainstorming for the ranking formula, and reviewing test edge cases.

## 2. Example Prompts & How I Used the Answers

* **Scaffolding:**
  > *"Generate configuration files for a Next.js App Router project using TypeScript, Tailwind CSS, SQLite, and Vitest, including root workspace scripts."*
  * **What I did:** Took the recommended directory structure and workspace configuration, verified that `npm run dev` started both apps via Next.js proxy rewrites, and adjusted the scripts so everything runs cleanly from the repo root in 3 commands.

* **Ranking Formula:**
  > *"Suggest a weighted rating formula in TypeScript that prevents a single 5-star review from beating an established museum with dozens of 4.7-star reviews."*
  * **What I did:** The AI suggested a Bayesian damped mean formula. I evaluated the constants and chose $m = 5$ prior reviews at $C = 3.5$ stars (`(totalStars + 17.5) / (reviewCount + 5)`), ensuring brand-new venues start conservatively and converge toward their true average as reviews come in. I then implemented it in `ranking.ts` and wrote isolated unit tests to prove the museum outranks the newcomer.

## 3. When the AI Was Wrong & What I Did Instead

1. **`better-sqlite3` installation failure:** The AI suggested `better-sqlite3`. On my Windows machine running Node 24, installation failed because `node-gyp` required Visual Studio C++ build tools. Rather than requiring reviewers to have complex C++ toolchains, I switched to `@libsql/client`, which uses precompiled local SQLite bindings and installs cleanly across platforms.
2. **Naive concurrency test:** When asked to write a concurrency test for tour bookings, the AI generated a unit test using a mocked in-memory database and `Promise.all`. This was unhelpful because an in-memory mock does not test actual SQLite file locks or multi-process race conditions. I threw that out and wrote a real test harness that launches two distinct Express server processes on separate ports targeting the same SQLite file on disk, proving that `BEGIN IMMEDIATE` prevents overbooking under real parallel HTTP requests.
3. **Browser extension hydration warnings:** In the frontend, React was logging hydration attribute warnings caused by browser extensions injecting attributes like `bis_skin_checked` and `cz-shortcut-listen`. The AI suggested disabling SSR or suppressing all hydration warnings. Instead, I added a targeted pre-hydration cleanup that strips only those extension attributes before React hydrates, keeping real application diagnostics intact.
