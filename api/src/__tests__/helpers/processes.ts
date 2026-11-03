import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

export interface ReadyProcess {
  child: ChildProcess;
  databasePath: string;
  pid: number;
  port?: number;
}

export async function stopProcess(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((accept) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 3_000);
    child.once("exit", () => { clearTimeout(force); accept(); });
    child.kill("SIGTERM");
  });
}

async function startProcess(script: string, databasePath: string, readyType: string): Promise<ReadyProcess> {
  const child = fork(script, [], {
    cwd: resolve(__dirname, "../../../.."),
    execArgv: ["--import", "tsx"],
    env: { ...process.env, PORT: "0", WAYFARER_DB_PATH: databasePath },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  let logs = "";
  const collect = (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-8_000); };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);

  try {
    return await new Promise<ReadyProcess>((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error(`API test process did not become ready. ${logs}`)), 15_000);
      const fail = (error: Error) => { clearTimeout(timeout); reject(error); };
      child.once("error", fail);
      child.once("exit", (code, signal) => fail(new Error(`API test process exited (${code ?? signal}). ${logs}`)));
      child.on("message", (message: unknown) => {
        if (!message || typeof message !== "object") return;
        const ready = message as { type?: string; databasePath?: string; pid?: number; port?: number };
        if (ready.type !== readyType) return;
        if (typeof ready.pid !== "number" || ready.databasePath !== databasePath || ready.pid !== child.pid) {
          fail(new Error("Test process opened an unexpected database or reported the wrong identity."));
          return;
        }
        clearTimeout(timeout);
        accept({ child, databasePath, pid: ready.pid, port: ready.port });
      });
    });
  } catch (error) {
    await stopProcess(child);
    throw error;
  }
}

export async function startApiProcess(databasePath: string): Promise<ReadyProcess & { port: number }> {
  const process = await startProcess(resolve(__dirname, "../../server.ts"), databasePath, "api-ready");
  if (!Number.isInteger(process.port) || !process.port) {
    await stopProcess(process.child);
    throw new Error("The API test process did not report its listening port.");
  }
  return { ...process, port: process.port };
}

export function startLockHolder(databasePath: string): Promise<ReadyProcess> {
  return startProcess(resolve(__dirname, "../fixtures/lock-holder.ts"), databasePath, "lock-ready");
}
