export function isDatabaseBusy(error: unknown): boolean {
  const visited = new Set<object>();
  let candidate = error;
  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    visited.add(candidate);
    const { code, cause } = candidate as { code?: unknown; cause?: unknown };
    if (typeof code === "string" && /^SQLITE_(BUSY|LOCKED)(?:_|$)/.test(code)) return true;
    candidate = cause;
  }
  return false;
}
