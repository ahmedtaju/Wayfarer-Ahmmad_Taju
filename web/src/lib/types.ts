export type Category = "History" | "Food" | "Nature";
export type Sort = "top-rated" | "name";

export interface User {
  id: number;
  name: string;
}

export interface PlaceSummary {
  id: number;
  name: string;
  category: Category;
  description: string;
  openingHours: string;
  imageRef: string | null;
  reviewCount: number;
  averageRating: number | null;
  rankingScore: number;
}

export interface Review {
  id: number;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  user: User;
}

export type PlaceReview = Review;

export interface TourSlot {
  id: number;
  startsAt: string;
  startsAtLabel: string;
  capacity: number;
  bookedSeats: number;
  availableSeats: number;
}

export interface PlaceDetail extends PlaceSummary {
  timeZone: "Africa/Addis_Ababa";
  reviews: Review[];
  tourSlots: TourSlot[];
}

export interface Booking {
  id: number;
  slotId: number;
  userId: number;
  seats: number;
  createdAt: string;
}
