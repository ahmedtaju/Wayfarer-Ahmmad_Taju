"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { PlaceSummary } from "../lib/types";
import { Rating } from "./ui";

const categoryImages = { History: "/images/history.jpg", Food: "/images/food.jpg", Nature: "/images/nature.jpg" };

export function PlaceCard({ place }: { place: PlaceSummary }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <Link href={`/places/${place.id}`} className="place-card">
      <div className="place-card-image-wrap">
        <Image className="place-card-image" src={imageFailed ? "/images/placeholder.svg" : place.imageRef ?? categoryImages[place.category]} alt="" width={720} height={480} unoptimized onError={() => setImageFailed(true)} />
        <span className="category-badge">{place.category}</span><span className="card-arrow" aria-hidden="true"><ArrowUpRight size={20} /></span>
      </div>
      <div className="place-card-content">
        <Rating average={place.averageRating} count={place.reviewCount} />
        <h2>{place.name}</h2>
        <p className="place-card-description">{place.description}</p>
        <p className="place-card-hours"><Clock3 size={14} aria-hidden="true" />{place.openingHours}</p>
      </div>
    </Link>
  );
}
