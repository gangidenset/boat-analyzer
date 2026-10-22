import { describe, expect, it } from 'vitest';
import { computeCourseStats, filterHistoricalRaces, matchesWaveBand, matchesWindBand } from '../src/analytics/venueStats';
import { makeHistorical } from './fixtures';

const races = [
  makeHistorical([1, 2, 3, 4, 5, 6], { date: '2026-10-01', windSpeed: 1, kimarite: '逃げ' }),
  makeHistorical([2, 1, 3, 4, 5, 6], { date: '2026-10-05', windSpeed: 6, waveHeight: 7, kimarite: '差し' }),
  makeHistorical([1, 3, 2, null, 4, 5], { date: '2026-10-03', venueId: '24', windSpeed: null, kimarite: '逃げ' }),
];

describe('場別・コース別統計', () => {
  it('1着率・2連対率・3連対率と対象件数・期間', () => {
    const s = computeCourseStats(races);
    expect(s.sampleRaces).toBe(3);
    expect(s.period).toEqual({ from: '2026-10-01', to: '2026-10-05' });
    expect(s.courses[0]).toMatchObject({ starts: 3, wins: 2, top2: 3 });
    expect(s.courses[0]!.winRate).toBeCloseTo(2 / 3, 10);
    // 4コースは失格（rank null）を出走数から除外
    expect(s.courses[3]!.starts).toBe(2);
    expect(s.kimarite[0]).toMatchObject({ name: '逃げ', count: 2 });
  });

  it('データ0件のとき率は null（0%と区別）', () => {
    const s = computeCourseStats([]);
    expect(s.sampleRaces).toBe(0);
    expect(s.period).toBeNull();
    expect(s.courses.every((c) => c.winRate === null)).toBe(true);
  });

  it('条件フィルター：場・風速・波高・期間', () => {
    expect(filterHistoricalRaces(races, { venueId: '24', windBand: 'all', waveBand: 'all' })).toHaveLength(1);
    expect(filterHistoricalRaces(races, { venueId: 'all', windBand: 'strong', waveBand: 'all' })).toHaveLength(1);
    expect(filterHistoricalRaces(races, { venueId: 'all', windBand: 'all', waveBand: 'high' })).toHaveLength(1);
    expect(filterHistoricalRaces(races, { venueId: 'all', windBand: 'all', waveBand: 'all', dateFrom: '2026-10-02', dateTo: '2026-10-04' })).toHaveLength(1);
  });

  it('条件指定時、風速欠損のレースは対象外（0mとみなさない）', () => {
    expect(matchesWindBand(null, 'calm')).toBe(false);
    expect(matchesWindBand(null, 'all')).toBe(true);
    expect(matchesWaveBand(null, 'low')).toBe(false);
    expect(matchesWindBand(2, 'calm')).toBe(true);
    expect(matchesWindBand(3, 'calm')).toBe(false);
    expect(matchesWindBand(4, 'moderate')).toBe(true);
    expect(matchesWaveBand(5, 'mid')).toBe(true);
    expect(matchesWaveBand(6, 'high')).toBe(true);
  });
});
