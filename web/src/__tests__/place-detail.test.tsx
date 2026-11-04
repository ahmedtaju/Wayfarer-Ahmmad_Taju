// @vitest-environment jsdom
import "../test/setup";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceDetailView } from "../components/place-detail";
import { ApiError } from "../lib/api";
import type { PlaceDetail } from "../lib/types";

const mocks = vi.hoisted(() => ({ userId: 1, resource: vi.fn(), reload: vi.fn() }));
vi.mock("../hooks/use-api-resource", () => ({ useApiResource: mocks.resource }));
vi.mock("../components/traveller-provider", () => ({
  useTraveller: () => ({ userId: mocks.userId, user: { id: mocks.userId, name: mocks.userId === 1 ? "Sara" : "Abel" } }),
}));
vi.mock("../components/review-dialog", () => ({
  ReviewDialog: ({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) => <div role="dialog" aria-label="Review editor"><button onClick={() => { void onSaved().then(onClose); }}>Save review</button></div>,
}));
vi.mock("../components/booking-dialog", () => ({
  BookingDialog: ({ initialSlotId, onClose }: { initialSlotId: number; onClose: () => void }) => <div role="dialog" aria-label={`Tour slot ${initialSlotId}`}><button onClick={onClose}>Close booking</button></div>,
}));

const place: PlaceDetail = {
  id: 1, name: "National Museum of Ethiopia", category: "History", description: "Discover archaeology, history, and art.", openingHours: "Daily, 09:00–17:30", imageRef: null,
  reviewCount: 1, averageRating: 4, rankingScore: 3.5833, timeZone: "Africa/Addis_Ababa",
  reviews: [{ id: 4, rating: 4, body: "A thoughtful collection.", createdAt: "2026-10-01T06:00:00.000Z", updatedAt: "2026-10-02T06:00:00.000Z", user: { id: 1, name: "Sara" } }],
  tourSlots: [
    { id: 11, startsAt: "2030-06-16T06:00:00.000Z", startsAtLabel: "16 Jun 2030, 09:00", capacity: 10, bookedSeats: 6, availableSeats: 4 },
    { id: 12, startsAt: "2030-06-17T06:00:00.000Z", startsAtLabel: "17 Jun 2030, 09:00", capacity: 10, bookedSeats: 9, availableSeats: 1 },
    { id: 13, startsAt: "2030-06-18T06:00:00.000Z", startsAtLabel: "18 Jun 2030, 09:00", capacity: 10, bookedSeats: 10, availableSeats: 0 },
  ],
};

beforeEach(() => {
  mocks.userId = 1;
  mocks.reload.mockReset().mockResolvedValue(undefined);
  mocks.resource.mockReset().mockReturnValue({ data: place, loading: false, error: null, reload: mocks.reload });
});
afterEach(cleanup);

describe("live place details", () => {
  it("renders actual place information, author reviews, and tour availability", () => {
    render(<PlaceDetailView placeId="1" />);
    expect(mocks.resource).toHaveBeenCalledWith("/api/places/1", 1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(place.name);
    expect(screen.getByText(place.description)).toBeInTheDocument();
    expect(screen.getByText(place.openingHours)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "4.0 out of 5 stars from 1 review" })).toBeInTheDocument();
    expect(screen.getByText("Your review")).toBeInTheDocument();
    expect(screen.getByText("A thoughtful collection.")).toBeInTheDocument();
    expect(screen.getByText("4 seats available")).toBeInTheDocument();
    expect(screen.getByText("1 seat available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fully booked: 18 Jun 2030, 09:00" })).toBeDisabled();
    expect(screen.getByText(/Addis Ababa time \(UTC\+3\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to all places" })).toHaveAttribute("href", "/");
  });

  it("opens the booking dialog with the clicked slot selected", () => {
    render(<PlaceDetailView placeId="1" />);
    fireEvent.click(screen.getByRole("button", { name: "Book tour: 17 Jun 2030, 09:00" }));
    expect(screen.getByRole("dialog", { name: "Tour slot 12" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close booking" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refreshes the place after a confirmed review save", async () => {
    render(<PlaceDetailView placeId="1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit your review" }));
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(mocks.reload).toHaveBeenCalledWith({ throwOnError: true });
    expect(screen.getByRole("status")).toHaveTextContent("Your review has been saved.");
  });

  it("closes the previous traveller's dialog and replaces ownership after switching users", () => {
    const view = render(<PlaceDetailView placeId="1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit your review" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    mocks.userId = 2;
    view.rerender(<PlaceDetailView placeId="1" />);
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/places/1", 2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write a review" })).toBeInTheDocument();
    expect(screen.queryByText("Your review")).not.toBeInTheDocument();
    expect(screen.getByText(/Reviewing as Abel/)).toBeInTheDocument();
  });

  it("shows loading, missing-place, and recoverable failed-load states", () => {
    mocks.resource.mockReturnValue({ data: null, loading: true, error: null, reload: mocks.reload });
    const view = render(<PlaceDetailView placeId="99" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading this place");
    mocks.resource.mockReturnValue({ data: null, loading: false, error: new ApiError(404, "PLACE_NOT_FOUND", "Place not found."), reload: mocks.reload });
    view.rerender(<PlaceDetailView placeId="99" />);
    expect(screen.getByRole("heading", { name: "This place couldn’t be found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore all places" })).toHaveAttribute("href", "/");
    mocks.resource.mockReturnValue({ data: null, loading: false, error: new Error("Connection interrupted."), reload: mocks.reload });
    view.rerender(<PlaceDetailView placeId="99" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Connection interrupted.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps existing information visible and labelled after a failed background refresh", () => {
    mocks.resource.mockReturnValue({ data: place, loading: false, error: new Error("Could not reconnect."), reload: mocks.reload });
    render(<PlaceDetailView placeId="1" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(place.name);
    expect(screen.getByRole("alert")).toHaveTextContent("last successful load");
    fireEvent.click(screen.getByRole("button", { name: "Refresh details" }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("represents a place without reviews or tours and uses a local image fallback", () => {
    mocks.resource.mockReturnValue({ data: { ...place, reviewCount: 0, averageRating: null, reviews: [], tourSlots: [] }, loading: false, error: null, reload: mocks.reload });
    render(<PlaceDetailView placeId="1" />);
    expect(screen.getByText("Be the first to share your experience")).toBeInTheDocument();
    expect(screen.getByText("No tours scheduled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write a review" })).toBeInTheDocument();
    const image = screen.getByAltText("");
    expect(new URL(image.getAttribute("src")!, window.location.href).pathname).toBe("/images/history.jpg");
    fireEvent.error(image);
    expect(new URL(image.getAttribute("src")!, window.location.href).pathname).toBe("/images/placeholder.svg");
  });
});
