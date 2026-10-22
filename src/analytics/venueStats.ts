import type { HistoricalRace } from '../domain/types';

/** 風速・波高の条件区分 */
export type WindBand = 'all' | 'calm' | 'moderate' | 'strong';
export type WaveBand = 'all' | 'low' | 'mid' | 'high';

export const WIND_BAND_LABEL: Record<WindBand, string> = {
  all: 'すべて',
  calm: '0〜2m',
  moderate: '3〜4m',
  strong: '5m以上',
};
export const WAVE_BAND_LABEL: Record<WaveBand, string> = {
  all: 'すべて',
  low: '0〜2cm',
  mid: '3〜5cm',
  high: '6cm以上',
};

export interface VenueStatsFilter {
  venueId: string | 'all';
  windBand: WindBand;
  waveBand: WaveBand;
  dateFrom?: string;
  dateTo?: string;
}

export function matchesWindBand(windSpeed: number | null, band: WindBand): boolean {
  if (band === 'all') return true;
  if (windSpeed === null) return false; // 条件指定時、欠損は対象外（0とみなさない）
  if (band === 'calm') return windSpeed <= 2;
  if (band === 'moderate') return windSpeed >= 3 && windSpeed <= 4;
  return windSpeed >= 5;
}

export function matchesWaveBand(waveHeight: number | null, band: WaveBand): boolean {
  if (band === 'all') return true;
  if (waveHeight === null) return false;
  if (band === 'low') return waveHeight <= 2;
  if (band === 'mid') return waveHeight >= 3 && waveHeight <= 5;
  return waveHeight >= 6;
}

export function filterHistoricalRaces(races: readonly HistoricalRace[], f: VenueStatsFilter): HistoricalRace[] {
  return races.filter(
    (r) =>
      (f.venueId === 'all' || r.venueId === f.venueId) &&
      matchesWindBand(r.windSpeed, f.windBand) &&
      matchesWaveBand(r.waveHeight, f.waveBand) &&
      (!f.dateFrom || r.date >= f.dateFrom) &&
      (!f.dateTo || r.date <= f.dateTo),
  );
}

export interface CourseStat {
  course: number;
  /** 着順が確定している出走数（失格・欠場等は除く） */
  starts: number;
  wins: number;
  top2: number;
  top3: number;
  /** starts が 0 のときは null（0%と区別する） */
  winRate: number | null;
  top2Rate: number | null;
  top3Rate: number | null;
}

export interface KimariteStat {
  name: string;
  count: number;
  rate: number;
}

export interface CourseStatsResult {
  sampleRaces: number;
  period: { from: string; to: string } | null;
  courses: CourseStat[];
  kimarite: KimariteStat[];
}

const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export function computeCourseStats(races: readonly HistoricalRace[]): CourseStatsResult {
  const acc = Array.from({ length: 6 }, (_, i) => ({ course: i + 1, starts: 0, wins: 0, top2: 0, top3: 0 }));
  const kimarite = new Map<string, number>();
  let from: string | null = null;
  let to: string | null = null;

  for (const race of races) {
    if (from === null || race.date < from) from = race.date;
    if (to === null || race.date > to) to = race.date;
    kimarite.set(race.kimarite, (kimarite.get(race.kimarite) ?? 0) + 1);
    for (const row of race.rows) {
      const a = acc[row.course - 1];
      if (!a || row.rank === null) continue;
      a.starts++;
      if (row.rank === 1) a.wins++;
      if (row.rank <= 2) a.top2++;
      if (row.rank <= 3) a.top3++;
    }
  }

  return {
    sampleRaces: races.length,
    period: from && to ? { from, to } : null,
    courses: acc.map((a) => ({
      ...a,
      winRate: rate(a.wins, a.starts),
      top2Rate: rate(a.top2, a.starts),
      top3Rate: rate(a.top3, a.starts),
    })),
    kimarite: [...kimarite.entries()]
      .map(([name, count]) => ({ name, count, rate: count / races.length }))
      .sort((a, b) => b.count - a.count),
  };
}
