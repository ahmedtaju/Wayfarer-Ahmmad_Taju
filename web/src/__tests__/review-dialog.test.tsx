// @vitest-environment jsdom
import "../test/setup";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewDialog } from "../components/review-dialog";
import { ApiError, NetworkError } from "../lib/api";
import type { PlaceDetail, Review } from "../lib/types";

const mocks = vi.hoisted(() => ({ userId: 1, request: vi.fn() }));
vi.mock("../components/traveller-provider", () => ({
  useTraveller: () => ({ userId: mocks.userId, user: { id: mocks.userId, name: mocks.userId === 1 ? "Sara" : "Liya" } }),
}));
vi.mock("../lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/api")>(), apiRequest: mocks.request,
}));

const saraReview: Review = { id: 4, rating: 4, body: "A thoughtful collection.", createdAt: "2026-10-01T06:00:00.000Z", updatedAt: "2026-10-01T06:00:00.000Z", user: { id: 1, name: "Sara" } };
const place: PlaceDetail = {
  id: 1, name: "National Museum of Ethiopia", category: "History", description: "Archaeology and art.", openingHours: "Daily, 09:00–17:30", imageRef: null,
  reviewCount: 1, averageRating: 4, rankingScore: 3.5833, timeZone: "Africa/Addis_Ababa", reviews: [saraReview], tourSlots: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

beforeEach(() => { mocks.userId = 1; mocks.request.mockReset().mockResolvedValue(saraReview); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("review dialog", () => {
  it("prefills the acting user's review and saves the trimmed draft with that user's identity", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<StrictMode><ReviewDialog place={place} onClose={onClose} onSaved={onSaved} /></StrictMode>);
    expect(screen.getByRole("dialog", { name: "Edit your review" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "4 stars" })).toBeChecked();
    expect(screen.getByLabelText("Your review")).toHaveValue(saraReview.body);
    expect(screen.getByText(/Sharing your experience as Sara/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "  I learned something new.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledWith("/api/places/1/reviews", expect.objectContaining({
      method: "POST", userId: 1, body: JSON.stringify({ rating: 5, body: "I learned something new." }), signal: expect.any(AbortSignal),
    }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("requires a rating and useful text before publishing a new review", () => {
    render(<ReviewDialog place={{ ...place, reviews: [] }} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish review" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a rating from 1 to 5 stars.");
    fireEvent.click(screen.getByRole("radio", { name: "3 stars" }));
    fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Publish review" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1 to 500 characters");
    fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "x".repeat(501) } });
    fireEvent.submit(screen.getByRole("form"));
    expect(mocks.request).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your review")).toHaveAttribute("maxlength", "500");
  });

  it("blocks repeated submits while pending and preserves the draft after a failed save", async () => {
    const pending = deferred<Review>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ReviewDialog place={place} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "Keep this draft while the connection is slow." } });
    fireEvent.submit(screen.getByRole("form"));
    fireEvent.submit(screen.getByRole("form"));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByLabelText("Your review")).toBeDisabled();
    await act(async () => { pending.reject(new ApiError(503, "DATABASE_BUSY", "Please try again shortly.")); });
    expect(screen.getByRole("alert")).toHaveTextContent("Please try again shortly.");
    expect(screen.getByLabelText("Your review")).toHaveValue("Keep this draft while the connection is slow.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("does not resubmit a write whose outcome is unknown", async () => {
    mocks.request.mockRejectedValueOnce(new NetworkError("The response could not be confirmed. This action may have been saved.", true));
    render(<ReviewDialog place={place} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("may have been saved"));
    expect(screen.getByLabelText("Your review")).toHaveValue(saraReview.body);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("aborts an unmounted save and ignores a late success", async () => {
    const pending = deferred<Review>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const view = render(<ReviewDialog place={place} onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const signal = mocks.request.mock.calls[0][1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(saraReview); });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("replaces the draft for a different actor and ignores the former actor's completion", async () => {
    const pending = deferred<Review>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const otherReview: Review = { ...saraReview, id: 5, user: { id: 3, name: "Liya" }, rating: 2, body: "Liya's separate experience." };
    const view = render(<ReviewDialog key="1:1" place={{ ...place, reviews: [saraReview, otherReview] }} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "Sara's pending draft." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const oldSignal = mocks.request.mock.calls[0][1].signal as AbortSignal;
    mocks.userId = 3;
    view.rerender(<ReviewDialog key="1:3" place={{ ...place, reviews: [saraReview, otherReview] }} onClose={onClose} onSaved={onSaved} />);
    expect(oldSignal.aborted).toBe(true);
    expect(screen.getByLabelText("Your review")).toHaveValue(otherReview.body);
    expect(screen.getByRole("radio", { name: "2 stars" })).toBeChecked();
    await act(async () => { pending.resolve(saraReview); });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your review")).toHaveValue(otherReview.body);
  });

  it("does not publish again if saving succeeded but the follow-up refresh failed", async () => {
    const onSaved = vi.fn().mockRejectedValue(new Error("refresh failed"));
    render(<ReviewDialog place={place} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Your review was saved"));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
