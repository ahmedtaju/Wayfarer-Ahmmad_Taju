import type { Database } from "./database";

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    category TEXT NOT NULL CHECK (category IN ('History', 'Food', 'Nature')),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    opening_hours TEXT NOT NULL CHECK (length(trim(opening_hours)) > 0),
    image_ref TEXT
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 500),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (place_id, user_id)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS tour_slots (
    id INTEGER PRIMARY KEY,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
    starts_at TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 9007199254740991)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY,
    slot_id INTEGER NOT NULL REFERENCES tour_slots(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 9007199254740991),
    created_at TEXT NOT NULL
  ) STRICT`,
  "CREATE INDEX IF NOT EXISTS reviews_user ON reviews(user_id)",
  "CREATE INDEX IF NOT EXISTS tour_slots_place_start ON tour_slots(place_id, starts_at)",
  "CREATE INDEX IF NOT EXISTS bookings_slot ON bookings(slot_id)",
  "CREATE INDEX IF NOT EXISTS bookings_user ON bookings(user_id)",
];

/** Initializes an empty database without deleting persisted traveller changes. */
export async function initializeDatabase(database: Database): Promise<void> {
  await database.client.batch(statements, "write");
}
