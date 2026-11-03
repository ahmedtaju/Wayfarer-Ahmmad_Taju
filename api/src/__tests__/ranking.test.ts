import { describe, expect, it } from "vitest";
import { calculateRanking, compareRankedPlaces } from "../services/ranking";

function place(id: number, name: string, totalStars: number, reviewCount: number) {
  return {
    id,
    name,
    reviewCount,
    rankingScore: calculateRanking(totalStars, reviewCount),
  };
}

describe("weighted place ranking", () => {
  it("ranks the museum's 5, 5, 4 reviews above one perfect café review", () => {
    const museum = place(1, "Museum", 14, 3);
    const cafe = place(2, "New café", 5, 1);

    expect(museum.rankingScore).toBe(3.9375);
    expect(cafe.rankingScore).toBe(3.75);
    expect([cafe, museum].sort(compareRankedPlaces)).toEqual([museum, cafe]);
  });

  it("uses the prior for zero reviews but places unrated places after rated ones", () => {
    const unrated = place(1, "Unrated", 0, 0);
    const rated = place(2, "Rated", 1, 1);

    expect(unrated.rankingScore).toBe(3.5);
    expect(rated.rankingScore).toBeLessThan(unrated.rankingScore);
    expect([unrated, rated].sort(compareRankedPlaces)).toEqual([rated, unrated]);
  });

  it("approaches the actual average as evidence increases", () => {
    const smallSample = calculateRanking(4, 1);
    const largeSample = calculateRanking(4_000, 1_000);

    expect(smallSample).toBeLessThan(largeSample);
    expect(largeSample).toBeLessThan(4);
    expect(Math.abs(4 - largeSample)).toBeLessThan(0.003);
  });

  it("increases with total stars when the review count is unchanged", () => {
    expect(calculateRanking(12, 3)).toBeLessThan(calculateRanking(13, 3));
  });

  it("compares unrounded scores even when their displayed rounding is equal", () => {
    const higher = place(1, "Z Museum", 14, 3);
    const lower = place(2, "A Gallery", 10, 2);

    expect(higher.rankingScore.toFixed(1)).toBe(lower.rankingScore.toFixed(1));
    expect([lower, higher].sort(compareRankedPlaces)).toEqual([higher, lower]);
  });

  it("breaks equal scores by name and then ID regardless of input order", () => {
    const first = place(1, "Museum", 14, 3);
    const second = place(2, "Museum", 14, 3);
    const last = place(3, "Park", 14, 3);

    expect([last, second, first].sort(compareRankedPlaces)).toEqual([first, second, last]);
    expect(compareRankedPlaces(first, first)).toBe(0);
  });

  it.each([
    [0, -1],
    [5, 1.5],
    [4.5, 1],
    [0, 1],
    [6, 1],
    [1, 0],
    [Number.NaN, 1],
    [5, Number.POSITIVE_INFINITY],
  ])("rejects invalid aggregate totals (%s stars, %s reviews)", (stars, reviews) => {
    expect(() => calculateRanking(stars, reviews)).toThrow(RangeError);
  });
});
