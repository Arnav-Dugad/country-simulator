import type { RegionId } from '../types';

/**
 * Approximate centroid of each playable nation, in degrees.
 *
 * Used to place markers on the world map. These are rough capital-or-centre
 * positions, accurate enough to be recognisable at map scale — this is a game
 * board, not a survey.
 */
export const COUNTRY_COORDS: Record<string, { lat: number; lon: number }> = {
  /* North America */
  usa: { lat: 39.0, lon: -98.0 },
  canada: { lat: 58.0, lon: -100.0 },
  mexico: { lat: 23.5, lon: -102.0 },
  cuba: { lat: 21.5, lon: -79.5 },
  guatemala: { lat: 15.5, lon: -90.3 },
  'costa-rica': { lat: 9.9, lon: -84.1 },
  panama: { lat: 8.5, lon: -80.0 },
  'dominican-republic': { lat: 18.7, lon: -70.2 },
  jamaica: { lat: 18.1, lon: -77.3 },

  /* South America */
  brazil: { lat: -10.0, lon: -53.0 },
  argentina: { lat: -35.0, lon: -65.0 },
  colombia: { lat: 4.0, lon: -73.0 },
  chile: { lat: -33.0, lon: -71.0 },
  peru: { lat: -9.5, lon: -75.0 },
  venezuela: { lat: 7.0, lon: -66.0 },
  ecuador: { lat: -1.5, lon: -78.5 },
  bolivia: { lat: -16.5, lon: -64.5 },
  uruguay: { lat: -33.0, lon: -56.0 },
  paraguay: { lat: -23.5, lon: -58.0 },

  /* Europe */
  uk: { lat: 54.0, lon: -2.5 },
  germany: { lat: 51.2, lon: 10.4 },
  france: { lat: 46.6, lon: 2.4 },
  italy: { lat: 42.8, lon: 12.6 },
  spain: { lat: 40.2, lon: -3.7 },
  poland: { lat: 52.0, lon: 19.4 },
  netherlands: { lat: 52.2, lon: 5.3 },
  sweden: { lat: 62.0, lon: 15.0 },
  norway: { lat: 62.0, lon: 9.0 },
  switzerland: { lat: 46.8, lon: 8.2 },
  russia: { lat: 61.5, lon: 60.0 },
  ukraine: { lat: 49.0, lon: 31.2 },
  turkey: { lat: 39.0, lon: 35.2 },
  greece: { lat: 39.1, lon: 22.0 },
  portugal: { lat: 39.6, lon: -8.0 },
  ireland: { lat: 53.2, lon: -8.0 },
  austria: { lat: 47.6, lon: 14.2 },
  belgium: { lat: 50.6, lon: 4.6 },
  denmark: { lat: 56.1, lon: 9.5 },
  finland: { lat: 64.0, lon: 26.0 },
  czechia: { lat: 49.8, lon: 15.5 },
  romania: { lat: 45.9, lon: 25.0 },
  hungary: { lat: 47.2, lon: 19.5 },
  serbia: { lat: 44.0, lon: 20.9 },
  iceland: { lat: 64.9, lon: -19.0 },

  /* Africa */
  nigeria: { lat: 9.1, lon: 8.7 },
  'south-africa': { lat: -29.0, lon: 24.7 },
  egypt: { lat: 26.8, lon: 30.8 },
  ethiopia: { lat: 9.1, lon: 40.5 },
  kenya: { lat: 0.2, lon: 37.9 },
  morocco: { lat: 31.8, lon: -7.1 },
  algeria: { lat: 28.0, lon: 1.7 },
  ghana: { lat: 7.9, lon: -1.0 },
  tanzania: { lat: -6.4, lon: 34.9 },
  drc: { lat: -4.0, lon: 21.8 },
  angola: { lat: -11.2, lon: 17.9 },
  senegal: { lat: 14.5, lon: -14.5 },
  zambia: { lat: -13.1, lon: 27.8 },
  botswana: { lat: -22.3, lon: 24.7 },
  rwanda: { lat: -1.9, lon: 29.9 },
  mozambique: { lat: -18.7, lon: 35.5 },

  /* Middle East */
  'saudi-arabia': { lat: 24.0, lon: 45.1 },
  iran: { lat: 32.4, lon: 53.7 },
  israel: { lat: 31.5, lon: 34.9 },
  uae: { lat: 23.4, lon: 53.8 },
  qatar: { lat: 25.4, lon: 51.2 },
  iraq: { lat: 33.2, lon: 43.7 },
  jordan: { lat: 30.6, lon: 36.2 },
  lebanon: { lat: 33.9, lon: 35.9 },

  /* South Asia */
  india: { lat: 21.0, lon: 78.0 },
  pakistan: { lat: 30.4, lon: 69.3 },
  bangladesh: { lat: 23.7, lon: 90.4 },
  'sri-lanka': { lat: 7.9, lon: 80.8 },
  nepal: { lat: 28.4, lon: 84.1 },

  /* East Asia */
  china: { lat: 35.9, lon: 104.2 },
  japan: { lat: 36.2, lon: 138.3 },
  'south-korea': { lat: 36.5, lon: 127.9 },
  'north-korea': { lat: 40.3, lon: 127.5 },
  taiwan: { lat: 23.7, lon: 121.0 },
  mongolia: { lat: 46.9, lon: 103.8 },

  /* Southeast Asia */
  indonesia: { lat: -2.5, lon: 118.0 },
  vietnam: { lat: 14.1, lon: 108.3 },
  thailand: { lat: 15.9, lon: 101.0 },
  philippines: { lat: 12.9, lon: 122.0 },
  malaysia: { lat: 4.2, lon: 101.9 },
  singapore: { lat: 1.35, lon: 103.8 },
  myanmar: { lat: 21.9, lon: 96.0 },

  /* Central Asia & Caucasus */
  kazakhstan: { lat: 48.0, lon: 66.9 },
  uzbekistan: { lat: 41.4, lon: 64.6 },
  azerbaijan: { lat: 40.1, lon: 47.6 },
  georgia: { lat: 42.3, lon: 43.4 },

  /* Oceania */
  australia: { lat: -25.3, lon: 133.8 },
  'new-zealand': { lat: -41.0, lon: 172.8 },
  'papua-new-guinea': { lat: -6.3, lon: 143.9 },
  fiji: { lat: -17.7, lon: 178.0 },
};

/** Where to drop a custom nation's marker, by the region it claims. */
export const REGION_CENTROIDS: Record<RegionId, { lat: number; lon: number }> = {
  'north-america': { lat: 40, lon: -100 },
  'south-america': { lat: -15, lon: -60 },
  europe: { lat: 50, lon: 12 },
  africa: { lat: 2, lon: 20 },
  'middle-east': { lat: 29, lon: 45 },
  'south-asia': { lat: 22, lon: 78 },
  'east-asia': { lat: 36, lon: 110 },
  'southeast-asia': { lat: 2, lon: 112 },
  'central-asia': { lat: 44, lon: 64 },
  oceania: { lat: -25, lon: 140 },
};

/**
 * Equirectangular projection into a 0–1 unit square.
 *
 * Deliberately not Mercator: the poles carry no gameplay and equirectangular
 * keeps the tropics — where most of the simulated world lives — readable.
 * Latitude is clamped to ±78° because nothing playable sits beyond it.
 */
export function project(lat: number, lon: number): { x: number; y: number } {
  const clampedLat = Math.max(-78, Math.min(78, lat));
  return {
    x: (lon + 180) / 360,
    y: (78 - clampedLat) / 156,
  };
}

export function coordsFor(
  countryId: string | null,
  region: RegionId,
): { lat: number; lon: number } {
  if (countryId && COUNTRY_COORDS[countryId]) return COUNTRY_COORDS[countryId];
  return REGION_CENTROIDS[region];
}
