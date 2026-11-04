"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { apiRequest, isAbortError, NetworkError } from "../lib/api";
import type { PlaceDetail, Review } from "../lib/types";
import { useTraveller } from "./traveller-provider";
import { Button, Dialog } from "./ui";

export interface ReviewDialogProps {
  place: PlaceDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function ReviewDialog({ place, onClose, onSaved }: ReviewDialogProps) {
  const { user, userId } = useTraveller();
  const [existingReview] = useState(() => place.reviews.find((review) => review.user.id === userId));
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [body, setBody] = useState(existingReview?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [saved, setSaved] = useState(false);
  const active = useRef(true);
  const submitting = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const fieldId = useId();

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, [place.id, userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || outcomeUnknown || saved) return;
    if (userId === null) { setError("Choose a traveller before writing a review."); return; }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) { setError("Choose a rating from 1 to 5 stars."); return; }
    const trimmedBody = body.trim();
    if (trimmedBody.length < 1 || trimmedBody.length > 500) {
      setError("Write a review of 1 to 500 characters after trimming.");
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError(null);
    const actingUserId = userId;
    const requestController = new AbortController();
    controller.current = requestController;
    const current = () => active.current && controller.current === requestController && !requestController.signal.aborted;

    try {
      await apiRequest<Review>(`/api/places/${place.id}/reviews`, {
        method: "POST",
        userId: actingUserId,
        body: JSON.stringify({ rating, body: trimmedBody }),
        signal: requestController.signal,
      });
    } catch (failure) {
      if (current()) {
        const interrupted = isAbortError(failure);
        setError(interrupted ? "The response was interrupted. Your review may have been saved." : failure instanceof Error ? failure.message : "Your review could not be saved. Please try again.");
        const uncertain = interrupted || failure instanceof NetworkError && failure.outcomeUnknown;
        setOutcomeUnknown(uncertain);
        setSaving(false);
        submitting.current = uncertain;
      }
      return;
    }

    if (!current()) return;
    setSaved(true);
    try {
      await onSaved();
      if (current()) onClose();
    } catch {
      if (current()) {
        setError("Your review was saved, but the place details could not be refreshed. Close this dialog and refresh the page.");
      }
    } finally {
      if (current()) {
        setSaving(false);
      }
    }
  }

  return (
    <Dialog title={existingReview ? "Edit your review" : "Write a review"} onClose={onClose} busy={saving}>
      <p className="dialog-intro"><strong>{place.name}</strong><br />Sharing your experience as {user?.name ?? "a traveller"}.</p>
      <form className="review-form" aria-label={`Review for ${place.name}`} onSubmit={submit} noValidate>
        <fieldset className="form-field" disabled={saving || saved}>
          <legend>Your rating</legend>
          <div className="review-rating-options" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className={`review-rating-option ${rating === value ? "is-selected" : ""}`}>
                <Star aria-hidden="true" fill={rating >= value ? "currentColor" : "none"} />
                <input type="radio" name={`${fieldId}-rating`} value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} ${value === 1 ? "star" : "stars"}`} />
                <span>{value}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-field">
          <label className="form-label" htmlFor={`${fieldId}-body`}>Your review</label>
          <textarea className="form-input" id={`${fieldId}-body`} rows={5} maxLength={500} value={body} disabled={saving || saved}
            aria-describedby={`${fieldId}-hint ${fieldId}-count`} onChange={(event) => setBody(event.target.value)}
            placeholder="What should another traveller know?" />
          <div className="review-field-meta"><span className="form-hint" id={`${fieldId}-hint`}>Share the details that made your visit memorable.</span><span id={`${fieldId}-count`}>{body.length}/500</span></div>
        </div>
        {error && <div className="form-error" role="alert"><p>{error}</p>{outcomeUnknown && <p>Close this dialog and refresh the place before trying again. Your draft is still here.</p>}</div>}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>{saved ? "Done" : "Cancel"}</Button>
          <Button type="submit" disabled={saving || userId === null || outcomeUnknown || saved}>{saving ? "Saving…" : existingReview ? "Save changes" : "Publish review"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
