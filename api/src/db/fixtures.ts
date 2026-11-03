export type Category = "History" | "Food" | "Nature";

type UserFixture = { id: number; name: string };
type PlaceFixture = {
  id: number;
  name: string;
  category: Category;
  description: string;
  openingHours: string;
  imageRef: string | null;
};
type ReviewFixture = {
  id: number;
  placeId: number;
  userId: number;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
};
type SlotFixture = {
  id: number;
  placeId: number;
  startsAt: string;
  capacity: number;
};
type BookingFixture = {
  id: number;
  slotId: number;
  userId: number;
  seats: number;
  createdAt: string;
};

export interface DemoFixtures {
  users: UserFixture[];
  places: PlaceFixture[];
  reviews: ReviewFixture[];
  slots: SlotFixture[];
  bookings: BookingFixture[];
}

/** Illustrative Addis Ababa fixtures; times and opening hours are demo data. */
export function createDemoFixtures(now: Date): DemoFixtures {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("The seed date must be a valid date.");
  }

  const timestamp = now.toISOString();
  const futureMorning = (daysFromNow: number): string => {
    const date = new Date(now.getTime());
    date.setUTCDate(date.getUTCDate() + daysFromNow);
    // 06:00 UTC is 09:00 in Addis Ababa, which uses UTC+03 year-round.
    date.setUTCHours(6, 0, 0, 0);
    return date.toISOString();
  };

  const places: PlaceFixture[] = [
    {
      id: 1,
      name: "National Museum of Ethiopia",
      category: "History",
      description: "Explore Ethiopia's archaeological heritage, early human history, and art in the heart of Addis Ababa.",
      openingHours: "Daily, 09:00–17:30",
      imageRef: null,
    },
    {
      id: 2,
      name: "New Corner Café",
      category: "Food",
      description: "A small new café serving Ethiopian coffee and fresh pastries near the city centre.",
      openingHours: "Daily, 07:00–20:00",
      imageRef: null,
    },
    {
      id: 3,
      name: "Ethnological Museum",
      category: "History",
      description: "Discover regional traditions and everyday objects in the gardens of Addis Ababa University.",
      openingHours: "Monday–Saturday, 09:00–17:00",
      imageRef: null,
    },
    {
      id: 4,
      name: "Holy Trinity Cathedral",
      category: "History",
      description: "Visit a landmark cathedral known for its stained glass, architecture, and place in the city's history.",
      openingHours: "Daily, 08:00–17:00",
      imageRef: null,
    },
    {
      id: 5,
      name: "Entoto Natural Park",
      category: "Nature",
      description: "Walk through eucalyptus woodland and enjoy views over Addis Ababa from the Entoto hills.",
      openingHours: "Daily, 08:00–18:00",
      imageRef: null,
    },
    {
      id: 6,
      name: "Unity Park",
      category: "Nature",
      description: "Spend time among landscaped gardens and exhibits introducing Ethiopia's natural and cultural diversity.",
      openingHours: "Tuesday–Sunday, 09:00–17:00",
      imageRef: null,
    },
    {
      id: 7,
      name: "Yod Abyssinia Cultural Restaurant",
      category: "Food",
      description: "Share traditional dishes and discover music and dance from different regions of Ethiopia.",
      openingHours: "Daily, 12:00–23:00",
      imageRef: null,
    },
    {
      id: 8,
      name: "Tomoca Coffee",
      category: "Food",
      description: "Stop for a freshly roasted Ethiopian coffee at a long-established local coffee house.",
      openingHours: "Monday–Saturday, 07:00–19:00",
      imageRef: null,
    },
    {
      id: 9,
      name: "Gullele Botanical Garden",
      category: "Nature",
      description: "Follow trails through native plants and forest on the northwestern edge of the city.",
      openingHours: "Daily, 08:00–18:00",
      imageRef: null,
    },
    {
      id: 10,
      name: "Lion of Judah Monument",
      category: "History",
      description: "See the bronze lion monument and learn about its connection to Ethiopia's railway and modern history.",
      openingHours: "Outdoor landmark, open daily",
      imageRef: null,
    },
  ];

  const reviewInputs: Array<[number, number, number, string]> = [
    [1, 1, 5, "The archaeology exhibits made the city's history feel tangible."],
    [1, 2, 5, "A memorable introduction to Ethiopia's early history."],
    [1, 3, 4, "Fascinating collection; allow enough time to read the exhibits."],
    [2, 1, 5, "Excellent coffee and a friendly welcome on my first visit."],
    [3, 1, 4, "Thoughtful displays and a peaceful garden setting."],
    [3, 2, 5, "I learned a lot about traditions across the country."],
    [4, 2, 4, "Beautiful stained glass and a helpful local guide."],
    [4, 3, 4, "An interesting stop for architecture and city history."],
    [5, 1, 5, "Fresh air and wonderful views from the walking trails."],
    [5, 3, 4, "A relaxing morning among the trees."],
    [6, 1, 4, "Well-kept gardens and plenty to see on a gentle walk."],
    [6, 2, 3, "Pleasant gardens; leave time to explore the different exhibits."],
    [7, 2, 5, "Sharing the food and watching the dancing was a highlight."],
    [7, 3, 4, "A lively evening and a generous selection of dishes."],
    [8, 1, 4, "Rich coffee and a good place for a short city break."],
    [8, 3, 5, "The freshly roasted coffee was worth returning for."],
    [9, 2, 4, "Quiet trails with interesting native plants."],
    [9, 3, 4, "A peaceful escape with plenty of shade."],
    [10, 1, 3, "An interesting landmark to include on a city walk."],
    [10, 2, 4, "Learning its history added context to the surrounding area."],
  ];

  return {
    users: [
      { id: 1, name: "Sara" },
      { id: 2, name: "Abel" },
      { id: 3, name: "Liya" },
    ],
    places,
    reviews: reviewInputs.map(([placeId, userId, rating, body], index) => ({
      id: index + 1,
      placeId,
      userId,
      rating,
      body,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    slots: [
      { id: 1, placeId: 1, startsAt: futureMorning(1), capacity: 10 },
      { id: 2, placeId: 1, startsAt: futureMorning(2), capacity: 10 },
      { id: 3, placeId: 3, startsAt: futureMorning(3), capacity: 10 },
      { id: 4, placeId: 5, startsAt: futureMorning(4), capacity: 12 },
      { id: 5, placeId: 7, startsAt: futureMorning(5), capacity: 6 },
    ],
    bookings: [
      { id: 1, slotId: 1, userId: 1, seats: 4, createdAt: timestamp },
      { id: 2, slotId: 1, userId: 2, seats: 2, createdAt: timestamp },
      { id: 3, slotId: 2, userId: 2, seats: 5, createdAt: timestamp },
      { id: 4, slotId: 2, userId: 3, seats: 4, createdAt: timestamp },
      { id: 5, slotId: 3, userId: 1, seats: 6, createdAt: timestamp },
      { id: 6, slotId: 3, userId: 3, seats: 4, createdAt: timestamp },
      { id: 7, slotId: 4, userId: 2, seats: 4, createdAt: timestamp },
    ],
  };
}
