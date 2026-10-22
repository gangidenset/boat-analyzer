import type { Race } from '../domain/types';

export interface RaceFilter {
  date: string | 'all';
  venueId: string | 'all';
  raceNo: number | 'all';
  status: Race['status'] | 'all';
}

export const DEFAULT_RACE_FILTER: RaceFilter = { date: 'all', venueId: 'all', raceNo: 'all', status: 'all' };

export function filterRaces(races: readonly Race[], f: RaceFilter): Race[] {
  return races
    .filter(
      (r) =>
        (f.date === 'all' || r.date === f.date) &&
        (f.venueId === 'all' || r.venueId === f.venueId) &&
        (f.raceNo === 'all' || r.raceNo === f.raceNo) &&
        (f.status === 'all' || r.status === f.status),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.venueId.localeCompare(b.venueId) || a.raceNo - b.raceNo);
}

export function uniqueDates(races: readonly Race[]): string[] {
  return [...new Set(races.map((r) => r.date))].sort();
}

export function uniqueVenueIds(races: readonly Race[]): string[] {
  return [...new Set(races.map((r) => r.venueId))].sort();
}
