# AI Tools Usage Log

This document tracks all AI tool interactions, prompts, verification steps, and human interventions throughout the project lifecycle.

---

## 1. Tooling Setup & Scaffolding Phase

* **Tools Used:** Antigravity (Gemini 2.5 Pro) for initial repository scaffolding, package configuration, and smoke testing setup.
* **Example Prompt:**
  > *"Generate configuration files for a Next.js App Router project using TypeScript, Tailwind CSS, SQLite, and Vitest, including a smoke test verifying both Vitest and local SQLite execution."*
* **Verification & Human Intervention:**
  * The initial AI output suggested adding `better-sqlite3`. During verification on Windows with Node v24.14.1, the package failed installation due to `node-gyp` missing Visual Studio C++ build tools.
  * Rather than requiring reviewers to install gigabytes of C++ compilers, I intervened and switched the SQLite driver to `@libsql/client`, which includes cross-platform precompiled binaries.
  * Verified that `npm install` and `npm test` execute cleanly with zero compilation warnings.

---

## 2. Workspace Architecture Phase

* **Tools Used:** Antigravity (Gemini 2.5 Pro) for structuring root npm workspaces (`api/` and `web/`) and Next.js proxy rewrites.
* **Example Prompt:**
  > *"Structure a root npm workspace separating Next.js into web and Express into api, configuring next.config.ts rewrites to proxy /api/* to Express, and write a Supertest integration test for the Express health endpoint."*
* **Verification & Human Intervention:**
  * Verified that `concurrently` starts both development servers from root without port collisions (`3000` for Next.js, `3001` for Express).
  * Validated that Next.js rewrites forward incoming browser requests directly to Express and return expected JSON payloads.
