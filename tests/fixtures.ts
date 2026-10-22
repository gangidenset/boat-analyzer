import type { Exhibition, HistoricalRace, Race } from '../src/domain/types';

/** テスト用の最小レース。必要な部分だけ上書きして使う */
export function makeRace(overrides: Partial<Race> = {}): Race {
  const entries = [1, 2, 3, 4, 5, 6].map((n) => ({
    boatNumber: n,
    status: 'entered' as const,
    racer: {
      id: `T${n}`,
      name: `テスト選手${n}`,
      grade: 'B1' as const,
      branch: '東京',
      age: 30,
      weight: 52,
      nationalWinRate: 5.0,
      localWinRate: 5.0,
      averageStartTiming: 0.16,
    },
    motor: { number: n, twoRate: 35 },
    boat: { number: n, twoRate: 35 },
    flyingCount: 0,
    lateCount: 0,
  }));
  return {
    id: 'R1',
    date: '2026-10-22',
    venueId: '12',
    raceNo: 1,
    title: 'テスト',
    deadline: '10:30',
    distance: 1800,
    status: 'scheduled',
    entries,
    exhibition: null,
    odds: null,
    result: null,
    ...overrides,
  };
}

export function makeExhibition(times: (number | null)[], overrides: Partial<Exhibition> = {}): Exhibition {
  return {
    publishedAt: '2026-10-22T10:05:00+09:00',
    weather: '晴',
    windSpeed: 2,
    windDirection: '北',
    waveHeight: 1,
    entries: times.map((t, i) => ({
      boatNumber: i + 1,
      exhibitionTime: t,
      straightTime: null,
      turnTime: null,
      lapTime: null,
      startCourse: i + 1,
      startTiming: 0.15,
      tilt: 0,
      partsChanged: [],
    })),
    ...overrides,
  };
}

/** 着順をコースindex順の rank で指定（null=失格等） */
export function makeHistorical(
  ranks: (number | null)[],
  overrides: Partial<HistoricalRace> = {},
): HistoricalRace {
  return {
    date: '2026-10-01',
    venueId: '12',
    raceNo: 1,
    weather: '晴',
    windSpeed: 1,
    waveHeight: 1,
    kimarite: '逃げ',
    rows: ranks.map((rank, i) => ({ course: i + 1, boatNumber: i + 1, rank })),
    ...overrides,
  };
}
