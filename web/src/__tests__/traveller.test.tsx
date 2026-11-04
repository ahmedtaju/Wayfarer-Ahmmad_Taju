// @vitest-environment jsdom
import "../test/setup";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TravellerProvider, useTraveller } from "../components/traveller-provider";

const users = [{ id: 1, name: "Sara" }, { id: 2, name: "Abel" }, { id: 3, name: "Liya" }];

function usersResponse(value = users): Response {
  return new Response(JSON.stringify({ data: value }), { headers: { "Content-Type": "application/json" } });
}

function Selection() {
  const traveller = useTraveller();
  return <div>
    <output data-testid="selected">{traveller.user?.name ?? "None"}</output>
    <output data-testid="user-id">{traveller.userId ?? "None"}</output>
    <output data-testid="loading">{String(traveller.loading)}</output>
    {traveller.error && <div role="alert">{traveller.error.message}</div>}
    {traveller.users.map((user) => <button key={user.id} onClick={() => traveller.selectUser(user.id)}>{user.name}</button>)}
    <button onClick={() => traveller.selectUser(999)}>Unknown traveller</button>
    <button onClick={traveller.retry}>Retry</button>
  </div>;
}

function renderSelection() {
  return render(<TravellerProvider><Selection /></TravellerProvider>);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("demo traveller selection", () => {
  it("does not access browser storage while rendering on the server", () => {
    const readStorage = vi.spyOn(Storage.prototype, "getItem");
    renderToString(<TravellerProvider><Selection /></TravellerProvider>);
    expect(readStorage).not.toHaveBeenCalled();
  });

  it("defaults to Sara from the returned users and persists explicit changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(usersResponse()));
    renderSelection();
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Sara"));
    expect(screen.getByTestId("user-id")).toHaveTextContent("1");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "Abel" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("Abel");
    expect(screen.getByTestId("user-id")).toHaveTextContent("2");
    expect(localStorage.getItem("wayfarer-user-id")).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Unknown traveller" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("Abel");
  });

  it("restores only a persisted ID that exists in the returned demo users", async () => {
    localStorage.setItem("wayfarer-user-id", "3");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(usersResponse()));
    renderSelection();
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Liya"));
    expect(localStorage.getItem("wayfarer-user-id")).toBe("3");
  });

  it.each(["999", "not-a-number", "0", "1.5"])("falls back safely from an invalid saved user (%s)", async (stored) => {
    localStorage.setItem("wayfarer-user-id", stored);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(usersResponse()));
    renderSelection();
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Sara"));
    await waitFor(() => expect(localStorage.getItem("wayfarer-user-id")).toBe("1"));
  });

  it("keeps this tab's actor when another tab updates local storage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(usersResponse()));
    renderSelection();
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Sara"));
    fireEvent.click(screen.getByRole("button", { name: "Abel" }));
    localStorage.setItem("wayfarer-user-id", "3");
    window.dispatchEvent(new StorageEvent("storage", { key: "wayfarer-user-id", newValue: "3", storageArea: localStorage }));
    expect(screen.getByTestId("selected")).toHaveTextContent("Abel");
  });

  it("continues selecting travellers when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(usersResponse()));
    renderSelection();
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Sara"));
    fireEvent.click(screen.getByRole("button", { name: "Liya" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("Liya");
  });

  it("shows a failed user load and permits an explicit retry", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(usersResponse());
    vi.stubGlobal("fetch", fetchMock);
    renderSelection();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach Wayfarer");
    expect(screen.getByTestId("selected")).toHaveTextContent("None");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Sara"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the selected user valid when a refresh returns a changed user list", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(usersResponse()).mockResolvedValueOnce(usersResponse([users[0]]));
    vi.stubGlobal("fetch", fetchMock);
    renderSelection();
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Sara"));
    fireEvent.click(screen.getByRole("button", { name: "Abel" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("Abel");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Sara"));
    await waitFor(() => expect(localStorage.getItem("wayfarer-user-id")).toBe("1"));
  });

  it("ignores an older users response after retry starts a newer request", async () => {
    let resolveOld!: (response: Response) => void;
    const oldRequest = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(oldRequest).mockResolvedValueOnce(usersResponse());
    vi.stubGlobal("fetch", fetchMock);
    renderSelection();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("Sara"));
    await act(async () => {
      resolveOld(usersResponse([{ id: 99, name: "Old response" }]));
      await oldRequest;
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("selected")).toHaveTextContent("Sara");
    expect(screen.queryByRole("button", { name: "Old response" })).toBeNull();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
