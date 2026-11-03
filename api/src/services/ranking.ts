const PRIOR_REVIEW_COUNT = 5;
const PRIOR_AVERAGE_RATING = 3.5;

/** Five starting reviews at 3.5 stars keep sparse ratings conservative. */
export function calculateRanking(totalStars: number, reviewCount: number): number {
  if (
    !Number.isSafeInteger(reviewCount) ||
    reviewCount < 0 ||
    !Number.isSafeInteger(totalStars) ||
    totalStars < reviewCount ||
    totalStars > reviewCount * 5
  ) {
    throw new RangeError("Rating totals must represent integer reviews from 1 to 5 stars.");
  }

  return (
    (totalStars + PRIOR_REVIEW_COUNT * PRIOR_AVERAGE_RATING) /
    (reviewCount + PRIOR_REVIEW_COUNT)
  );
}

export function compareRankedPlaces<
  T extends { id: number; name: string; reviewCount: number; rankingScore: number },
>(a: T, b: T): number {
  const ratedDifference = Number(b.reviewCount > 0) - Number(a.reviewCount > 0);
  if (ratedDifference !== 0) return ratedDifference;

  const scoreDifference = b.rankingScore - a.rankingScore;
  if (scoreDifference !== 0) return scoreDifference;

  // String ordering avoids dependence on the machine's default locale.
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return a.id - b.id;
}
