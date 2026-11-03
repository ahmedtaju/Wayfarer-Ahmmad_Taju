export const CITY_TIME_ZONE = "Africa/Addis_Ababa";

const cityDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CITY_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
  hour12: false,
});

/** UTC timestamps remain the source of truth; labels always use the city's clock. */
export function formatCityDateTime(timestamp: string): string {
  return cityDateTimeFormatter.format(new Date(timestamp));
}
