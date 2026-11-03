import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { isDatabaseBusy } from "./errors";

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

async function createConfiguredClient(path: string): Promise<Client> {
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
  return client;
}

export async function openDatabase(options: { path?: string } = {}): Promise<Database> {
  const path = resolveDatabasePath(options.path);
  await mkdir(dirname(path), { recursive: true });
  let client: Client | undefined = await createConfiguredClient(path);
  let closed = false;
  let pending: Promise<unknown> = Promise.resolve();

  function run<T>(operation: (connection: Client) => Promise<T>): Promise<T> {
    // Serialize use of this handle so a failed connection is discarded before
    // another caller can use it. Cross-process capacity safety comes from SQLite.
    const result = pending.then(async () => {
      if (closed) throw new Error("The database is closed.");
      const connection = client ?? await createConfiguredClient(path);
      client = connection;
      try {
        return await operation(connection);
      } catch (error) {
        // The installed local driver can retain a failed native BEGIN statement.
        // Reusing that connection after BUSY may poison later COMMIT operations.
        if (isDatabaseBusy(error)) {
          connection.close();
          client = undefined;
        }
        throw error;
      }
    });
    pending = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    path,
    // libsql's interactive transaction() detaches its configured connection.
    // Restrict this handle to execute/batch so every operation keeps these PRAGMAs.
    client: {
      execute: (statement) => run((connection) => connection.execute(statement)),
      batch: (statements, mode) => run((connection) => connection.batch(statements, mode)),
    },
    close: () => {
      closed = true;
      client?.close();
      client = undefined;
    },
  };
}
