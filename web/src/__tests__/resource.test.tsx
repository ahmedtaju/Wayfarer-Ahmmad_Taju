// @vitest-environment jsdom
import "../test/setup";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useApiResource } from "../hooks/use-api-resource";

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Response>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify({ data: value }), { headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("API resource request ownership", () => {
  it("clears a previous actor's data and ignores that actor's late response", async () => {
    const oldReload = deferredResponse();
    const newActor = deferredResponse();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ review: "Sara's review" }))
      .mockReturnValueOnce(oldReload.promise)
      .mockReturnValueOnce(newActor.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ userId }) => useApiResource<{ review: string }>("/api/places/1", userId), {
      initialProps: { userId: 1 },
    });
    await waitFor(() => expect(result.current.data?.review).toBe("Sara's review"));
    let oldReloadCompletion!: Promise<void>;
    act(() => { oldReloadCompletion = result.current.reload(); });
    rerender({ userId: 2 });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => { oldReload.resolve(json({ review: "Late Sara review" })); await oldReloadCompletion; });
    expect(result.current.data).toBeNull();
    await act(async () => { newActor.resolve(json({ review: "Abel's review" })); });
    await waitFor(() => expect(result.current.data?.review).toBe("Abel's review"));
    expect(fetchMock.mock.calls[2][1].headers.get("X-User-Id")).toBe("2");
  });

  it("ignores stale failures after a new path succeeds", async () => {
    const old = deferredResponse();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(json({ id: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ path }) => useApiResource<{ id: number }>(path), {
      initialProps: { path: "/api/places/1" },
    });
    rerender({ path: "/api/places/2" });
    await waitFor(() => expect(result.current.data?.id).toBe(2));
    await act(async () => { old.reject(new TypeError("late disconnect")); });
    expect(result.current.data?.id).toBe(2);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("aborts and invalidates an earlier same-key reload", async () => {
    const earlier = deferredResponse();
    const latest = deferredResponse();
    const fetchMock = vi.fn().mockReturnValueOnce(earlier.promise).mockReturnValueOnce(latest.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useApiResource<string>("/api/places"));
    let completion!: Promise<void>;
    act(() => { completion = result.current.reload(); });
    await act(async () => { latest.resolve(json("latest")); await completion; });
    await act(async () => { earlier.resolve(json("older")); });
    expect(result.current.data).toBe("latest");
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("records reload errors without rejecting the reload promise and can recover", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json("existing"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(json("refreshed"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useApiResource<string>("/api/places"));
    await waitFor(() => expect(result.current.data).toBe("existing"));
    await act(async () => { await expect(result.current.reload()).resolves.toBeUndefined(); });
    expect(result.current.error?.message).toContain("Could not reach Wayfarer");
    expect(result.current.data).toBe("existing");
    expect(result.current.loading).toBe(false);
    await act(async () => { await result.current.reload(); });
    expect(result.current.data).toBe("refreshed");
    expect(result.current.error).toBeNull();
  });

  it("can explicitly reject a refresh while retaining the last data and recording its error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json("existing"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "DATABASE_BUSY", message: "Try refreshing later." }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useApiResource<string>("/api/places"));
    await waitFor(() => expect(result.current.data).toBe("existing"));
    await act(async () => {
      await expect(result.current.reload({ throwOnError: true })).rejects.toMatchObject({ status: 503, code: "DATABASE_BUSY" });
    });
    expect(result.current.data).toBe("existing");
    expect(result.current.error?.message).toBe("Try refreshing later.");
    expect(result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps obsolete throwing refreshes silent after the acting user changes", async () => {
    const obsolete = deferredResponse();
    const fetchMock = vi.fn().mockResolvedValueOnce(json("Sara"))
      .mockReturnValueOnce(obsolete.promise).mockResolvedValueOnce(json("Abel"));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ userId }) => useApiResource<string>("/api/places/1", userId), {
      initialProps: { userId: 1 },
    });
    await waitFor(() => expect(result.current.data).toBe("Sara"));
    let completion!: Promise<void>;
    act(() => { completion = result.current.reload({ throwOnError: true }); });
    rerender({ userId: 2 });
    await waitFor(() => expect(result.current.data).toBe("Abel"));
    await act(async () => {
      obsolete.reject(new TypeError("Old traveller's refresh disconnected."));
      await expect(completion).resolves.toBeUndefined();
    });
    expect(result.current.data).toBe("Abel");
    expect(result.current.error).toBeNull();
  });

  it("does not let an old actor's captured reload replace a current request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json("Sara")).mockResolvedValueOnce(json("Abel"));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ userId }) => useApiResource<string>("/api/places/1", userId), {
      initialProps: { userId: 1 },
    });
    await waitFor(() => expect(result.current.data).toBe("Sara"));
    const staleReload = result.current.reload;
    rerender({ userId: 2 });
    await waitFor(() => expect(result.current.data).toBe("Abel"));
    await act(async () => { await staleReload(); });
    expect(result.current.data).toBe("Abel");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears disabled resources and ignores completions after unmount", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender, unmount } = renderHook(({ path }: { path: string | null }) => useApiResource<string>(path), {
      initialProps: { path: "/api/places" as string | null },
    });
    rerender({ path: null });
    expect(result.current).toMatchObject({ data: null, error: null, loading: false });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    const staleReload = result.current.reload;
    unmount();
    await act(async () => { pending.resolve(json("too late")); await staleReload(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
