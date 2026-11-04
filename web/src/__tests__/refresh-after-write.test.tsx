// @vitest-environment jsdom
import "../test/setup";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceDetailView } from "../components/place-detail";
import type { Booking, PlaceDetail, Review } from "../lib/types";

// Keep the actual resource hook, API client, and both dialogs together: mocking
// reload as a rejecting callback would miss the integration contract.
vi.mock("../components/traveller-provider", () => ({
  useTraveller: () => ({ userId: 1, user: { id: 1, name: "Sara" } }),
}));

const review: Review = {
  id: 4, rating: 4, body: "A thoughtful collection.",
  createdAt: "2030-06-15T06:00:00.000Z", updatedAt: "2030-06-15T06:00:00.000Z",
  user: { id: 1, name: "Sara" },
};
const place: PlaceDetail = {
  id: 1, name: "National Museum of Ethiopia", category: "History",
  description: "Discover archaeology, history, and art.", openingHours: "Daily, 09:00–17:30", imageRef: null,
  reviewCount: 1, averageRating: 4, rankingScore: 3.5833333333333335, timeZone: "Africa/Addis_Ababa",
  reviews: [review],
  tourSlots: [{ id: 11, startsAt: "2030-06-16T06:00:00.000Z", startsAtLabel: "16 Jun 2030, 09:00", capacity: 10, bookedSeats: 6, availableSeats: 4 }],
};
const booking: Booking = { id: 42, slotId: 11, userId: 1, seats: 2, createdAt: "2030-06-15T10:00:00.000Z" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
}

function fetchWithFailedRefresh(writeResult: unknown, status: number) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(json(place))
    .mockResolvedValueOnce(json(writeResult, status))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "DATABASE_BUSY", message: "The latest details are unavailable." }), {
      status: 503, headers: { "Content-Type": "application/json" },
    }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saved actions whose actual resource refresh fails", () => {
  it("keeps a saved review open with its saved-but-refresh-failed notice and blocks resubmission", async () => {
    const fetchMock = fetchWithFailedRefresh({ ...review, body: "My saved update." }, 200);
    render(<PlaceDetailView placeId="1" />);
    await screen.findByRole("heading", { level: 1, name: place.name });
    fireEvent.click(screen.getByRole("button", { name: "Edit your review" }));
    fireEvent.change(screen.getByLabelText("Your review", { exact: true }), { target: { value: "My saved update." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(within(screen.getByRole("dialog", { name: "Edit your review" })).getByRole("alert"))
      .toHaveTextContent("Your review was saved, but the place details could not be refreshed."));
    const dialog = screen.getByRole("dialog", { name: "Edit your review" });
    expect(within(dialog).getByLabelText("Your review", { exact: true })).toHaveValue("My saved update.");
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeEnabled();
    fireEvent.submit(within(dialog).getByRole("form"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? "GET"])).toEqual([
      ["/api/places/1", "GET"], ["/api/places/1/reviews", "POST"], ["/api/places/1", "GET"],
    ]);
    expect(screen.getByRole("heading", { level: 1, name: place.name })).toBeInTheDocument();
  });

  it("keeps the booking confirmed and explains that only the follow-up availability load failed", async () => {
    const fetchMock = fetchWithFailedRefresh(booking, 201);
    render(<PlaceDetailView placeId="1" />);
    await screen.findByRole("heading", { level: 1, name: place.name });
    fireEvent.click(screen.getByRole("button", { name: "Book tour: 16 Jun 2030, 09:00" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Number of seats" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));

    await waitFor(() => expect(within(screen.getByRole("dialog", { name: "Booking confirmed" })).getByRole("alert"))
      .toHaveTextContent("Your booking is confirmed, but availability could not be refreshed."));
    const dialog = screen.getByRole("dialog", { name: "Booking confirmed" });
    expect(within(dialog).getByText("2 seats reserved for Sara.")).toBeInTheDocument();
    expect(within(dialog).getByText("Booking reference #42")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeEnabled();
    expect(within(dialog).queryByRole("button", { name: "Confirm reservation" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? "GET"])).toEqual([
      ["/api/places/1", "GET"], ["/api/tour-slots/11/bookings", "POST"], ["/api/places/1", "GET"],
    ]);
  });
});
