export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly outcomeUnknown = false) {
    super(message);
    this.name = "NetworkError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error !== null && typeof error === "object" && "name" in error && error.name === "AbortError";
}

export type ApiRequestOptions = RequestInit & { userId?: number | null };

const uncertainWriteMessage = "The response could not be confirmed. This action may have been saved. Refresh before trying again.";

/** The caller chooses when to retry; writes are never retried automatically. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { userId, ...requestOptions } = options;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = /^\/api(?:\/|$)/.test(normalizedPath) ? normalizedPath : `/api${normalizedPath}`;
  const headers = new Headers(requestOptions.headers);
  if (requestOptions.body !== undefined && requestOptions.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (userId !== undefined && userId !== null) headers.set("X-User-Id", String(userId));
  else if (userId === null) headers.delete("X-User-Id");

  const method = (requestOptions.method ?? "GET").toUpperCase();
  const isWrite = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  let response: Response;
  try {
    response = await fetch(url, { ...requestOptions, headers });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new NetworkError(
      isWrite ? uncertainWriteMessage : "Could not reach Wayfarer. Check your connection and try again.",
      isWrite,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (response.ok && isWrite) throw new NetworkError(uncertainWriteMessage, true);
  }

  if (!response.ok) {
    const failure = payload !== null && typeof payload === "object"
      ? payload as { error?: unknown; message?: unknown } : {};
    // A proxy can lose the backend's response after the write has committed.
    // Only a structured backend rejection gives the caller a definite outcome.
    if (isWrite && (
      response.status === 502 || response.status === 504 ||
      typeof failure.error !== "string" || typeof failure.message !== "string"
    )) {
      throw new NetworkError(uncertainWriteMessage, true);
    }
    throw new ApiError(
      response.status,
      typeof failure.error === "string" ? failure.error : "HTTP_ERROR",
      typeof failure.message === "string" ? failure.message : `Request failed with status ${response.status}.`,
    );
  }

  if (payload === null || typeof payload !== "object" || !Object.prototype.hasOwnProperty.call(payload, "data")) {
    if (isWrite) throw new NetworkError(uncertainWriteMessage, true);
    throw new ApiError(response.status, "INVALID_RESPONSE", "Wayfarer returned an invalid response. Please try again.");
  }
  const data = (payload as { data: T }).data;
  if (isWrite && (data === null || data === undefined)) throw new NetworkError(uncertainWriteMessage, true);
  return data;
}
