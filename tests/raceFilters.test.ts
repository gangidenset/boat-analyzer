import { describe, expect, it } from 'vitest';
import { DEFAULT_RACE_FILTER, filterRaces, uniqueDates, uniqueVenueIds } from '../src/analytics/raceFilters';
import { parseRaceFilter } from '../src/pages/RacesPage';
import { makeRace } from './fixtures';

const races = [
  makeRace({ id: 'a', date: '2026-10-22', venueId: '24', raceNo: 2 }),
  makeRace({ id: 'b', date: '2026-10-21', venueId: '12', raceNo: 1, status: 'finished' }),
  makeRace({ id: 'c', date: '2026-10-22', venueId: '12', raceNo: 2 }),
  makeRace({ id: 'd', date: '2026-10-22', venueId: '12', raceNo: 1 }),
];

describe('レースフィルター', () => {
  it('条件なしは全件を日付・場・R順で返す', () => {
    expect(filterRaces(races, DEFAULT_RACE_FILTER).map((r) => r.id)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('開催日・競艇場・レース番号・状態で絞り込み', () => {
    expect(filterRaces(races, { ...DEFAULT_RACE_FILTER, date: '2026-10-22' })).toHaveLength(3);
    expect(filterRaces(races, { ...DEFAULT_RACE_FILTER, venueId: '12', raceNo: 2 }).map((r) => r.id)).toEqual(['c']);
    expect(filterRaces(races, { ...DEFAULT_RACE_FILTER, status: 'finished' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRaces(races, { ...DEFAULT_RACE_FILTER, venueId: '01' })).toEqual([]);
  });
  it('選択肢の一覧', () => {
    expect(uniqueDates(races)).toEqual(['2026-10-21', '2026-10-22']);
    expect(uniqueVenueIds(races)).toEqual(['12', '24']);
  });
  it('URLパラメータの不正値は「すべて」に戻す', () => {
    const f = parseRaceFilter(new URLSearchParams('raceNo=99&status=foo&venue=12'));
    expect(f).toEqual({ date: 'all', venueId: '12', raceNo: 'all', status: 'all' });
    expect(parseRaceFilter(new URLSearchParams('raceNo=3')).raceNo).toBe(3);
  });
});
