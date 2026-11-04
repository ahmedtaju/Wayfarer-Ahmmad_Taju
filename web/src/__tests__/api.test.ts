// @vitest-environment jsdom
import "../test/setup";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, isAbortError, NetworkError, type ApiRequestOptions } from "../lib/api";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("frontend API requests", () => {
  it("unwraps domain data and leaves body-free reads without a JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [{ id: 1, name: "Sara" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiRequest("users")).resolves.toEqual([{ id: 1, name: "Sara" }]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users");
    expect(options.headers.get("Content-Type")).toBeNull();
    expect(options.headers.get("X-User-Id")).toBeNull();
  });

  it("supports Headers instances and snapshots the acting user for each request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: { id: 10 } }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const headers = new Headers({ "X-Request-Tag": "review", "X-User-Id": "99" });
    const options: ApiRequestOptions = { method: "POST", body: JSON.stringify({ seats: 1 }), headers, userId: 1 };
    const pending = apiRequest("/api/tour-slots/2/bookings", options);
    options.userId = 2;
    await pending;
    const [, requestOptions] = fetchMock.mock.calls[0];
    expect(requestOptions.headers.get("X-User-Id")).toBe("1");
    expect(requestOptions.headers.get("Content-Type")).toBe("application/json");
    expect(requestOptions.headers.get("X-Request-Tag")).toBe("review");
    expect(headers.get("X-User-Id")).toBe("99");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("removes a stale acting-user header when selection is explicitly absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("places", { userId: null, headers: { "X-User-Id": "3" } });
    expect(fetchMock.mock.calls[0][1].headers.has("X-User-Id")).toBe(false);
  });

  it("retains explicit content types rather than replacing caller headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("places/1/reviews", {
      method: "POST", body: "{}", headers: { "Content-Type": "application/json; charset=utf-8" }, userId: 2,
    });
    expect(fetchMock.mock.calls[0][1].headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  });

  it.each([
    [400, "VALIDATION_ERROR"], [404, "PLACE_NOT_FOUND"], [409, "INSUFFICIENT_CAPACITY"], [503, "DATABASE_BUSY"],
  ])("preserves server error status and code (%i %s)", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: code, message: "A useful public message." }, status)));
    const error = await apiRequest("places/1").catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message: "A useful public message." });
  });

  it("provides a stable fallback for an unreadable error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream unavailable", { status: 502 })));
    await expect(apiRequest("places")).rejects.toMatchObject({ status: 502, code: "HTTP_ERROR", message: "Request failed with status 502." });
  });

  it.each([502, 504])("does not promise a failed write when a proxy returns %i", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("The upstream response was lost.", { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiRequest("tour-slots/2/bookings", { method: "POST", body: '{"seats":1}', userId: 1 })).rejects.toMatchObject({
      name: "NetworkError", outcomeUnknown: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a structured gateway error as uncertain rather than a backend rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "GATEWAY_TIMEOUT", message: "Timed out." }, 504)));
    await expect(apiRequest("places/1/reviews", { method: "POST", body: "{}", userId: 1 })).rejects.toMatchObject({
      name: "NetworkError", outcomeUnknown: true,
    });
  });

  it("treats an opaque write failure with no readable backend outcome as uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 0, json: async () => { throw new SyntaxError("unreadable"); } }));
    await expect(apiRequest("places/1/reviews", { method: "POST", body: "{}", userId: 1 })).rejects.toMatchObject({
      name: "NetworkError", outcomeUnknown: true,
    });
  });

  it("treats an unstructured server write failure as uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "No structured backend result." }, 500)));
    await expect(apiRequest("places/1/reviews", { method: "POST", body: "{}", userId: 1 })).rejects.toMatchObject({
      name: "NetworkError", outcomeUnknown: true,
    });
  });

  it.each([[500, "INTERNAL_ERROR"], [503, "DATABASE_BUSY"]])("retains a precise structured backend write failure (%i %s)", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: code, message: "A known backend rejection." }, status)));
    const error = await apiRequest("tour-slots/2/bookings", { method: "POST", body: '{"seats":1}', userId: 1 }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message: "A known backend rejection." });
    expect(error).not.toBeInstanceOf(NetworkError);
  });

  it("marks a disconnected write as uncertain and never retries it", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const error = await apiRequest("tour-slots/2/bookings", { method: "POST", body: '{"seats":1}', userId: 1 }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ outcomeUnknown: true });
    expect((error as Error).message).toContain("may have been saved");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["not-json", '{"unexpected":true}', '{"data":null}'])("marks an unconfirmed successful write response as uncertain (%s)", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 201 })));
    await expect(apiRequest("places/1/reviews", { method: "POST", body: "{}", userId: 1 })).rejects.toMatchObject({
      name: "NetworkError", outcomeUnknown: true,
    });
  });

  it("distinguishes a read connection failure from an unknown write outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(apiRequest("places")).rejects.toMatchObject({ name: "NetworkError", outcomeUnknown: false });
  });

  it("rejects invalid successful read envelopes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ users: [] })));
    await expect(apiRequest("users")).rejects.toMatchObject({ name: "ApiError", code: "INVALID_RESPONSE" });
  });

  it("preserves cancellation and forwards its signal without retrying", async () => {
    const aborted = new DOMException("Canceled", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(aborted);
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await expect(apiRequest("places", { signal: controller.signal })).rejects.toBe(aborted);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isAbortError(aborted)).toBe(true);
    expect(isAbortError(new Error("Canceled"))).toBe(false);
  });

  it("preserves a native abort reason when cancellation interrupts response-body reading", async () => {
    const controller = new AbortController();
    let rejectBody!: (reason: unknown) => void;
    const body = new Promise<unknown>((_accept, reject) => { rejectBody = reject; });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => body });
    vi.stubGlobal("fetch", fetchMock);
    const request = apiRequest("places", { signal: controller.signal });
    const assertion = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    rejectBody(controller.signal.reason);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
