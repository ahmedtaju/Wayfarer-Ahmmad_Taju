"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, Users } from "lucide-react";
import { apiRequest, ApiError, isAbortError } from "../lib/api";
import type { Booking, PlaceDetail } from "../lib/types";
import { useTraveller } from "./traveller-provider";
import { Button, Dialog, StatusPanel } from "./ui";

export interface BookingDialogProps {
  place: PlaceDetail;
  initialSlotId: number;
  onClose: () => void;
  onBooked: () => Promise<void>;
}

export function BookingDialog({ place, initialSlotId, onClose, onBooked }: BookingDialogProps) {
  const { user, userId } = useTraveller();
  const [availability, setAvailability] = useState(place);
  const [selectedId, setSelectedId] = useState(initialSlotId);
  const [seats, setSeats] = useState("1");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "conflict" | "unknown">("idle");
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const active = useRef(true);
  const submitting = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const fieldId = useId();
  const slot = availability.tourSlots.find((candidate) => candidate.id === selectedId);

  useEffect(() => {
    active.current = true;
    const requests = controllers.current;
    return () => {
      active.current = false;
      requests.forEach((request) => request.abort());
    };
  }, []);

  async function refreshAvailability() {
    setRefreshing(true);
    setRefreshError(null);
    const request = new AbortController();
    controllers.current.add(request);
    try {
      const latest = await apiRequest<PlaceDetail>(`/api/places/${place.id}`, { userId, signal: request.signal });
      if (active.current && !request.signal.aborted) setAvailability(latest);
    } catch (failure) {
      if (active.current && !request.signal.aborted) setRefreshError(failure instanceof Error ? failure.message : "Availability could not be refreshed.");
    } finally {
      controllers.current.delete(request);
      if (active.current) setRefreshing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || confirmed || phase === "unknown") return;
    if (userId === null || !slot) { setError("Choose a traveller and a tour time."); return; }
    const quantity = Number(seats);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > slot.availableSeats) {
      setError(`Choose a whole number from 1 to ${slot.availableSeats} seats.`);
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError(null);
    const request = new AbortController();
    controllers.current.add(request);
    const actingUserId = userId;
    try {
      const booking = await apiRequest<Booking>(`/api/tour-slots/${slot.id}/bookings`, {
        method: "POST", userId: actingUserId, body: JSON.stringify({ seats: quantity }), signal: request.signal,
      });
      if (!active.current || request.signal.aborted) return;
      setConfirmed(booking);
      try { await onBooked(); }
      catch { if (active.current) setRefreshError("Your booking is confirmed, but availability could not be refreshed. Refresh the place after closing."); }
    } catch (failure) {
      if (!active.current || request.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 409) {
        setPhase("conflict");
        setError("Those seats were just taken. Check the updated availability and choose another tour time.");
        await refreshAvailability();
        if (active.current) await onBooked().catch(() => undefined);
      } else if (failure instanceof ApiError) {
        setError(failure.message);
      } else {
        setPhase("unknown");
        setError(isAbortError(failure) ? "The response was interrupted." : "We lost the connection before confirming the response.");
      }
    } finally {
      controllers.current.delete(request);
      if (active.current) { setSaving(false); submitting.current = false; }
    }
  }

  return (
    <Dialog title={confirmed ? "Booking confirmed" : "Reserve a guided tour"} onClose={onClose} busy={saving}>
      <p className="dialog-intro"><strong>{place.name}</strong><br />Reserving as {user?.name ?? "a traveller"} · Addis Ababa time (UTC+3)</p>
      {confirmed ? <>
        <div className="booking-confirmation"><span className="booking-check"><Check aria-hidden="true" /></span><h3>Your next discovery is booked.</h3><p>{confirmed.seats} {confirmed.seats === 1 ? "seat" : "seats"} reserved for {user?.name}.</p><p>{slot?.startsAtLabel}</p><p className="form-hint">Booking reference #{confirmed.id}</p></div>
        {refreshError && <p className="form-error" role="alert">{refreshError}</p>}
        <div className="dialog-actions"><Button onClick={onClose}>Done</Button></div>
      </> : phase === "unknown" ? <>
        <StatusPanel title="Booking outcome unknown" tone="info"><p>{error} Your request may have been saved. Avoid submitting it again until you have checked the outcome.</p><p>Refreshing below only checks seat availability; it does not send another booking.</p></StatusPanel>
        {refreshError && <p className="form-error" role="alert">{refreshError}</p>}
        <div className="dialog-actions"><Button variant="secondary" disabled={refreshing} onClick={() => { void refreshAvailability(); }}>{refreshing ? "Refreshing…" : "Refresh availability"}</Button><Button onClick={onClose}>Close</Button></div>
      </> : <form aria-label={`Booking for ${place.name}`} onSubmit={submit} noValidate>
        <fieldset className="form-field booking-times" disabled={saving || refreshing}>
          <legend><CalendarDays size={16} aria-hidden="true" /> Choose a tour time</legend>
          {availability.tourSlots.map((candidate) => <label className={`booking-time ${candidate.id === selectedId ? "is-selected" : ""} ${candidate.availableSeats === 0 ? "is-full" : ""}`} key={candidate.id}>
            <input type="radio" name={`${fieldId}-slot`} value={candidate.id} checked={selectedId === candidate.id} disabled={candidate.availableSeats === 0} onChange={() => { setSelectedId(candidate.id); setSeats("1"); setPhase("idle"); setError(null); }} />
            <span><strong>{candidate.startsAtLabel}</strong><small>{candidate.availableSeats === 0 ? "Fully booked" : `${candidate.availableSeats} of ${candidate.capacity} seats left`}</small></span>
          </label>)}
        </fieldset>
        <div className="booking-party"><div><label className="form-label" htmlFor={`${fieldId}-seats`}><Users size={16} aria-hidden="true" /> Number of seats</label><p className="form-hint">Reserve for yourself or your group.</p></div>
          <input className="form-input booking-quantity" id={`${fieldId}-seats`} type="number" inputMode="numeric" min={1} max={slot?.availableSeats ?? 0} step={1} value={seats} disabled={saving || refreshing || !slot?.availableSeats} onChange={(event) => setSeats(event.target.value)} />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {refreshError && <p className="form-error" role="alert">{refreshError}</p>}
        {refreshing && <p className="form-hint" role="status">Checking the latest availability…</p>}
        <p className="booking-note">Seats are confirmed only after your reservation is saved. Availability can change while you decide.</p>
        <div className="dialog-actions"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || refreshing || userId === null || !slot?.availableSeats || (phase === "conflict" && refreshError !== null)}>{saving ? "Reserving…" : "Confirm reservation"}</Button></div>
      </form>}
    </Dialog>
  );
}
