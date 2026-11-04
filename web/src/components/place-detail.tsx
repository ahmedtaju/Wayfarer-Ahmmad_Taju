"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Clock3, MapPin, RefreshCw, Star } from "lucide-react";
import { useApiResource, type ApiResource } from "../hooks/use-api-resource";
import { ApiError } from "../lib/api";
import type { PlaceDetail } from "../lib/types";
import { BookingDialog } from "./booking-dialog";
import { ReviewDialog } from "./review-dialog";
import { useTraveller } from "./traveller-provider";
import { Button, Rating, StatusPanel } from "./ui";

const categoryImages = { History: "/images/history.jpg", Food: "/images/food.jpg", Nature: "/images/nature.jpg" };
const reviewDate = (value: string) => new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa",
}).format(new Date(value));

function DetailContent({ place, loading, error, reload }: {
  place: PlaceDetail;
  loading: boolean;
  error: Error | null;
  reload: ApiResource<PlaceDetail>["reload"];
}) {
  const { user, userId } = useTraveller();
  const [imageFailed, setImageFailed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ownReview = place.reviews.find((review) => review.user.id === userId);

  async function reviewSaved() {
    setNotice("Your review has been saved.");
    await reload({ throwOnError: true });
  }

  return (
    <div className="page-container place-detail">
      <nav className="detail-breadcrumb" aria-label="Breadcrumb"><Link href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to all places</Link><span aria-hidden="true">/</span><span>{place.category}</span></nav>
      {notice && <div className="detail-notice" role="status">{notice}</div>}
      {error && <StatusPanel title="The latest details couldn’t be loaded" tone="error" action={<Button variant="secondary" onClick={() => { void reload(); }}>Refresh details</Button>}><p>{error.message} The information below is from the last successful load.</p></StatusPanel>}
      {loading && <p className="detail-notice" role="status">Refreshing place details…</p>}
      <section className="detail-hero" aria-labelledby="place-title">
        <Image className="detail-hero-image" src={imageFailed ? "/images/placeholder.svg" : place.imageRef ?? categoryImages[place.category]} alt="" width={1000} height={800} priority unoptimized onError={() => setImageFailed(true)} />
        <div className="detail-hero-copy">
          <div className="detail-eyebrow"><span className="category-badge">{place.category}</span><span><MapPin size={14} aria-hidden="true" /> Addis Ababa</span></div>
          <h1 id="place-title">{place.name}</h1>
          <Rating average={place.averageRating} count={place.reviewCount} />
          <p>{place.description}</p>
          <div className="detail-meta"><Clock3 size={17} aria-hidden="true" /><div><strong>Opening hours</strong><p>{place.openingHours}</p></div></div>
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="detail-section" aria-labelledby="reviews-title">
            <div className="detail-reviews-heading"><div><p className="eyebrow">From fellow travellers</p><h2 id="reviews-title">Reviews <span className="muted">({place.reviewCount})</span></h2></div>
              <Button variant="secondary" disabled={userId === null || loading} onClick={() => setReviewOpen(true)}>{ownReview ? "Edit your review" : "Write a review"}</Button>
            </div>
            <p className="muted">{user ? `Reviewing as ${user.name}. Your experience can help someone find their next stop.` : "Choose a traveller in the header to share a review."}</p>
            {place.reviews.length === 0 ? <StatusPanel title="Be the first to share your experience" tone="empty"><p>A useful detail can make someone else’s visit a little better.</p></StatusPanel> : (
              <ul className="review-list">{place.reviews.map((review) => (
                <li className="review-item" key={review.id}>
                  <span className="review-avatar" aria-hidden="true">{review.user.name.slice(0, 1)}</span>
                  <div><div className="review-item-heading"><div><h3>{review.user.name} {review.user.id === userId && <span className="review-own-label">Your review</span>}</h3><time className="review-date" dateTime={review.updatedAt}>{review.createdAt !== review.updatedAt ? "Updated " : ""}{reviewDate(review.updatedAt)}</time></div>
                    <span className="review-stars" role="img" aria-label={`${review.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={14} aria-hidden="true" fill={value <= review.rating ? "currentColor" : "none"} />)}</span>
                  </div><p>{review.body}</p></div>
                </li>
              ))}</ul>
            )}
          </section>
        </div>

        <aside className="tour-sidebar" aria-labelledby="tours-title">
          <p className="eyebrow">See a little more</p><h2 id="tours-title">Explore with a tour</h2>
          <p className="muted">Choose a time and reserve your seats. All tour times are shown in Addis Ababa time (UTC+3).</p>
          {place.tourSlots.length === 0 ? <StatusPanel title="No tours scheduled" tone="empty"><p>You can still explore this place on your own.</p></StatusPanel> : <ul className="tour-list">{place.tourSlots.map((slot) => (
            <li className={`tour-slot ${slot.availableSeats === 0 ? "tour-slot--full" : ""}`} key={slot.id}>
              <div className="tour-slot-heading"><Clock3 size={17} aria-hidden="true" /><time dateTime={slot.startsAt}>{slot.startsAtLabel}</time></div>
              <p className="tour-slot-availability">{slot.availableSeats === 0 ? "Fully booked" : `${slot.availableSeats} ${slot.availableSeats === 1 ? "seat" : "seats"} available`}</p>
              <Button variant="secondary" aria-label={slot.availableSeats === 0 ? `Fully booked: ${slot.startsAtLabel}` : `Book tour: ${slot.startsAtLabel}`} disabled={slot.availableSeats === 0 || userId === null || loading} onClick={() => setBookingSlotId(slot.id)}>{slot.availableSeats === 0 ? "Fully booked" : "Book tour"}</Button>
            </li>
          ))}</ul>}
          <Button variant="ghost" disabled={loading} onClick={() => { void reload(); }}><RefreshCw size={14} aria-hidden="true" /> Refresh availability</Button>
        </aside>
      </div>
      {reviewOpen && <ReviewDialog key={`${place.id}:${userId}`} place={place} onClose={() => setReviewOpen(false)} onSaved={reviewSaved} />}
      {bookingSlotId !== null && <BookingDialog key={`${place.id}:${userId}`} place={place} initialSlotId={bookingSlotId} onClose={() => setBookingSlotId(null)} onBooked={() => reload({ throwOnError: true })} />}
    </div>
  );
}

export function PlaceDetailView({ placeId }: { placeId: string }) {
  const { userId } = useTraveller();
  const { data, loading, error, reload } = useApiResource<PlaceDetail>(`/api/places/${encodeURIComponent(placeId)}`, userId);

  if (!data) return <div className="page-container place-detail"><nav className="detail-breadcrumb"><Link href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to all places</Link></nav>
    {loading ? <StatusPanel title="Loading this place"><p>Gathering the details, reviews, and available tours.</p></StatusPanel> : error instanceof ApiError && error.status === 404 ? (
      <StatusPanel title="This place couldn’t be found" tone="empty" action={<Link href="/" className="button button--secondary">Explore all places</Link>}><p>The place may no longer be available. There are more corners of the city to discover.</p></StatusPanel>
    ) : <StatusPanel title="We couldn’t load this place" tone="error" action={<Button variant="secondary" onClick={() => { void reload(); }}>Try again</Button>}><p>{error?.message ?? "Please try loading the place again."}</p></StatusPanel>}
  </div>;

  return <DetailContent key={`${data.id}:${userId}`} place={data} loading={loading} error={error} reload={reload} />;
}
