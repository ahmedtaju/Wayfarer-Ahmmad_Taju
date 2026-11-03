import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client";

const API_DIRECTORY = resolve(__dirname, "../..");
export const LOCK_TIMEOUT_MS = 5_000;

export interface Database {
  readonly path: string;
  readonly client: Pick<Client, "execute" | "batch">;
  close(): void;
}

/** Relative overrides always resolve from api/, never the shell's directory. */
export function resolveDatabasePath(path = process.env.WAYFARER_DB_PATH): string {
  if (path !== undefined && path.trim().length === 0) {
    throw new Error("WAYFARER_DB_PATH must be a nonempty file path.");
  }
  return resolve(API_DIRECTORY, path ?? "data/wayfarer.db");
}

export async function openDatabase(options: { path?: string } = {}): Promise<Database> {
  const path = resolveDatabasePath(options.path);
  await mkdir(dirname(path), { recursive: true });
  const client = createClient({ url: pathToFileURL(path).href });

  try {
    await client.execute(`PRAGMA busy_timeout = ${LOCK_TIMEOUT_MS}`);
    await client.execute("PRAGMA foreign_keys = ON");
    const foreignKeys = await client.execute("PRAGMA foreign_keys");
    if (foreignKeys.rows[0]?.foreign_keys !== 1) {
      throw new Error("SQLite foreign-key enforcement could not be enabled.");
    }
  } catch (error) {
    client.close();
    throw error;
  }

  return {
    path,
    // libsql's interactive transaction() detaches its configured connection.
    // Restrict this handle to execute/batch so every operation keeps these PRAGMAs.
    client: {
      execute: client.execute.bind(client),
      batch: client.batch.bind(client),
    },
    close: () => client.close(),
  };
}
