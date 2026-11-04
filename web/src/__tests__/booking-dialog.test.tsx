// @vitest-environment jsdom
import "../test/setup";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingDialog } from "../components/booking-dialog";
import { ApiError, NetworkError } from "../lib/api";
import type { Booking, PlaceDetail } from "../lib/types";

const mocks = vi.hoisted(() => ({ userId: 1, request: vi.fn() }));
vi.mock("../components/traveller-provider", () => ({
  useTraveller: () => ({ userId: mocks.userId, user: { id: mocks.userId, name: mocks.userId === 1 ? "Sara" : "Liya" } }),
}));
vi.mock("../lib/api", async () => ({
  ...await vi.importActual<typeof import("../lib/api")>("../lib/api"), apiRequest: mocks.request,
}));

const place: PlaceDetail = {
  id: 1, name: "National Museum of Ethiopia", category: "History", description: "Archaeology and art.",
  openingHours: "Daily, 09:00–17:30", imageRef: null, reviewCount: 0, averageRating: null,
  rankingScore: 3.5, timeZone: "Africa/Addis_Ababa", reviews: [],
  tourSlots: [
    { id: 11, startsAt: "2030-06-16T06:00:00.000Z", startsAtLabel: "16 Jun 2030, 09:00", capacity: 10, bookedSeats: 6, availableSeats: 4 },
    { id: 12, startsAt: "2030-06-17T06:00:00.000Z", startsAtLabel: "17 Jun 2030, 09:00", capacity: 10, bookedSeats: 9, availableSeats: 1 },
    { id: 13, startsAt: "2030-06-18T06:00:00.000Z", startsAtLabel: "18 Jun 2030, 09:00", capacity: 10, bookedSeats: 10, availableSeats: 0 },
  ],
};
const booking: Booking = { id: 42, slotId: 11, userId: 1, seats: 2, createdAt: "2030-06-15T10:00:00.000Z" };
const refreshedPlace: PlaceDetail = {
  ...place,
  tourSlots: place.tourSlots.map((slot) => slot.id === 12 ? { ...slot, bookedSeats: 10, availableSeats: 0 } : slot),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function openBooking(initialSlotId = 11) {
  const onBooked = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const view = render(<BookingDialog place={place} initialSlotId={initialSlotId} onClose={onClose} onBooked={onBooked} />);
  return { ...view, onBooked, onClose };
}

beforeEach(() => { mocks.userId = 1; mocks.request.mockReset().mockResolvedValue(booking); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("tour booking dialog", () => {
  it("prefills the clicked tour time, its seat limit, and the acting traveller", () => {
    render(<StrictMode><BookingDialog place={place} initialSlotId={12} onClose={vi.fn()} onBooked={vi.fn()} /></StrictMode>);
    expect(screen.getByRole("dialog", { name: "Reserve a guided tour" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /17 Jun 2030, 09:00/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /16 Jun 2030, 09:00/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /18 Jun 2030, 09:00/ })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Number of seats" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton")).toHaveAttribute("max", "1");
    expect(screen.getByText(/Reserving as Sara/)).toHaveTextContent("Addis Ababa time (UTC+3)");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "5", ""])("rejects an invalid seat quantity (%s) before sending a booking", (value) => {
    openBooking();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a whole number from 1 to 4 seats.");
    expect(screen.getByRole("spinbutton")).toHaveAttribute("min", "1");
    expect(screen.getByRole("spinbutton")).toHaveAttribute("max", "4");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("sends one request for repeated clicks and submit events while the reservation is pending", async () => {
    const pending = deferred<Booking>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const { onBooked, onClose } = openBooking();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    const form = screen.getByRole("form");
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    fireEvent.click(screen.getByRole("button", { name: "Reserving…" }));
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith("/api/tour-slots/11/bookings", expect.objectContaining({
      method: "POST", userId: 1, body: JSON.stringify({ seats: 2 }), signal: expect.any(AbortSignal),
    }));
    expect(screen.getByRole("button", { name: "Reserving…" })).toBeDisabled();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Booking confirmed" })).not.toBeInTheDocument();
    expect(onBooked).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(booking); });
    expect(screen.getByRole("dialog", { name: "Booking confirmed" })).toBeInTheDocument();
    expect(screen.getByText("2 seats reserved for Sara.")).toBeInTheDocument();
    expect(screen.getByText("Booking reference #42")).toBeInTheDocument();
    expect(onBooked).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("preserves the selected time and quantity after a definite server rejection and retries only on request", async () => {
    mocks.request.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred."));
    const { onBooked } = openBooking();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("An unexpected error occurred."));
    expect(screen.getByRole("spinbutton")).toHaveValue(2);
    expect(screen.getByRole("radio", { name: /16 Jun 2030, 09:00/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Confirm reservation" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Booking confirmed" })).not.toBeInTheDocument();
    expect(onBooked).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await waitFor(() => expect(onBooked).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[1][1].body).toBe(JSON.stringify({ seats: 2 }));
  });

  it("keeps a saved booking confirmed when the follow-up place refresh fails", async () => {
    const { onBooked } = openBooking();
    onBooked.mockRejectedValueOnce(new Error("Refresh failed."));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Your booking is confirmed, but availability could not be refreshed."));
    expect(screen.getByRole("dialog", { name: "Booking confirmed" })).toBeInTheDocument();
    expect(screen.getByText("Booking reference #42")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm reservation" })).not.toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("refreshes a capacity conflict and lets the traveller explicitly choose an available alternative", async () => {
    mocks.request
      .mockRejectedValueOnce(new ApiError(409, "INSUFFICIENT_CAPACITY", "Not enough seats remain for this booking."))
      .mockResolvedValueOnce(refreshedPlace)
      .mockResolvedValueOnce(booking);
    const { onBooked } = openBooking(12);
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await waitFor(() => expect(onBooked).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenNthCalledWith(2, "/api/places/1", expect.objectContaining({ userId: 1, signal: expect.any(AbortSignal) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Those seats were just taken.");
    expect(screen.getByRole("radio", { name: /17 Jun 2030, 09:00/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /17 Jun 2030, 09:00/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm reservation" })).toBeDisabled();
    expect(mocks.request).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("radio", { name: /16 Jun 2030, 09:00/ }));
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
    expect(screen.getByRole("spinbutton")).toHaveAttribute("max", "4");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Booking confirmed" })).toBeInTheDocument());
    expect(mocks.request).toHaveBeenNthCalledWith(3, "/api/tour-slots/11/bookings", expect.objectContaining({ method: "POST", body: JSON.stringify({ seats: 2 }), userId: 1 }));
    expect(onBooked).toHaveBeenCalledTimes(2);
  });

  it("does not claim failure or send another booking after an unknown network outcome, even after refreshing", async () => {
    mocks.request
      .mockRejectedValueOnce(new NetworkError("The response could not be confirmed.", true))
      .mockResolvedValueOnce(refreshedPlace);
    const { onBooked } = openBooking(12);
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Booking outcome unknown" })).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Your request may have been saved.");
    expect(screen.getByRole("status")).toHaveTextContent("Avoid submitting it again");
    expect(screen.queryByText(/booking failed|reservation failed|not booked/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(onBooked).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh availability" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh availability" })).toBeEnabled());
    expect(mocks.request).toHaveBeenNthCalledWith(2, "/api/places/1", expect.objectContaining({ userId: 1, signal: expect.any(AbortSignal) }));
    expect(mocks.request.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Booking outcome unknown" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm reservation" })).not.toBeInTheDocument();
    expect(onBooked).not.toHaveBeenCalled();
  });

  it("aborts an unmounted request and ignores its late booking confirmation", async () => {
    const pending = deferred<Booking>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const { unmount, onBooked, onClose } = openBooking();
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    const signal = mocks.request.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(booking); });
    expect(onBooked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("aborts a pending conflict refresh on unmount and ignores its late result", async () => {
    const refresh = deferred<PlaceDetail>();
    mocks.request
      .mockRejectedValueOnce(new ApiError(409, "INSUFFICIENT_CAPACITY", "Not enough seats remain."))
      .mockReturnValueOnce(refresh.promise);
    const { unmount, onBooked } = openBooking(12);
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    const signal = mocks.request.mock.calls[1][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { refresh.resolve(refreshedPlace); });
    expect(onBooked).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh actor's reservation and ignores the previous actor's late response", async () => {
    const pending = deferred<Booking>();
    mocks.request.mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...booking, id: 43, slotId: 12, userId: 3, seats: 1 });
    const onBooked = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const view = render(<BookingDialog key="1:1" place={place} initialSlotId={11} onClose={onClose} onBooked={onBooked} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    const oldSignal = mocks.request.mock.calls[0][1].signal as AbortSignal;
    mocks.userId = 3;
    view.rerender(<BookingDialog key="1:3" place={place} initialSlotId={12} onClose={onClose} onBooked={onBooked} />);
    expect(oldSignal.aborted).toBe(true);
    expect(screen.getByText(/Reserving as Liya/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
    expect(screen.getByRole("radio", { name: /17 Jun 2030, 09:00/ })).toBeChecked();
    await act(async () => { pending.resolve(booking); });
    expect(screen.queryByRole("heading", { name: "Booking confirmed" })).not.toBeInTheDocument();
    expect(onBooked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await waitFor(() => expect(onBooked).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenNthCalledWith(2, "/api/tour-slots/12/bookings", expect.objectContaining({ userId: 3, body: JSON.stringify({ seats: 1 }) }));
    expect(screen.getByText("1 seat reserved for Liya.")).toBeInTheDocument();
    expect(screen.getByText("Booking reference #43")).toBeInTheDocument();
  });
});
