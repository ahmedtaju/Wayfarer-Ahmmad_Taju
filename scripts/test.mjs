import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = await mkdtemp(join(tmpdir(), "wayfarer-test-run-"));
const args = process.argv.slice(2);

try {
  const child = spawn(process.execPath, [
    join(repository, "node_modules/vitest/vitest.mjs"),
    ...(args.includes("--watch") ? [] : ["run"]),
    ...args,
  ], {
    cwd: repository,
    stdio: "inherit",
    env: { ...process.env, WAYFARER_TEST_DIRECTORY: directory },
  });
  const stop = (signal) => child.kill(signal);
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    process.exitCode = await new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => accept(code ?? 1));
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
} finally {
  // Windows keeps native SQLite statements open until their worker exits.
  // Clean only this run's private directory after the entire child has stopped.
  if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith("wayfarer-test-run-")) {
    throw new Error("Refusing to clean an unexpected test directory.");
  }
  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
