import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = await mkdtemp(join(tmpdir(), "wayfarer-browser-run-"));
const environment = { ...process.env, WAYFARER_DB_PATH: join(directory, "browser.db"), WAYFARER_BROWSER_TEST: "1" };

async function run(args) {
  const child = spawn(process.execPath, args, { cwd: repository, env: environment, stdio: "inherit", windowsHide: true });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    return await new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => accept(code ?? 1));
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

try {
  const seeded = await run(["--import", "tsx", "api/src/db/seed.ts"]);
  process.exitCode = seeded || await run(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)]);
} finally {
  if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith("wayfarer-browser-run-")) {
    throw new Error("Refusing to clean an unexpected browser-test directory.");
  }
  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
