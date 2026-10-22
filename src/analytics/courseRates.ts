import type { HistoricalRace, Race } from '../domain/types';

/**
 * 場・コース別の1着数・出走数を「日付より前」で高速に引ける索引。
 *
 * 予測では必ず対象レースの日付より前の過去レースだけを使う（同日・未来の結果を混ぜない）。
 * 実データでは過去レースと予測対象が同じ成績ファイルから作られるため、これがないと
 * 自分自身の結果を使って予測する「データ漏れ」が起きる。
 */
interface Cumulative {
  dates: string[];
  /** prefix[i] = dates[0..i-1] の累計（コースごとの wins / starts） */
  wins: number[][];
  starts: number[][];
  races: number[];
}

function buildCumulative(races: readonly HistoricalRace[]): Cumulative {
  const byDate = new Map<string, { wins: number[]; starts: number[]; races: number }>();
  for (const r of races) {
    const d = byDate.get(r.date) ?? { wins: [0, 0, 0, 0, 0, 0], starts: [0, 0, 0, 0, 0, 0], races: 0 };
    d.races++;
    for (const row of r.rows) {
      if (row.rank === null) continue;
      d.starts[row.course - 1]!++;
      if (row.rank === 1) d.wins[row.course - 1]!++;
    }
    byDate.set(r.date, d);
  }
  const dates = [...byDate.keys()].sort();
  const wins = [[0, 0, 0, 0, 0, 0]];
  const starts = [[0, 0, 0, 0, 0, 0]];
  const counts = [0];
  for (const date of dates) {
    const d = byDate.get(date)!;
    wins.push(wins.at(-1)!.map((w, i) => w + d.wins[i]!));
    starts.push(starts.at(-1)!.map((s, i) => s + d.starts[i]!));
    counts.push(counts.at(-1)! + d.races);
  }
  return { dates, wins, starts, races: counts };
}

/** dates の中で date 未満の件数（二分探索） */
function countBefore(dates: readonly string[], date: string): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid]! < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface CourseCounts {
  wins: number[];
  starts: number[];
  races: number;
}

export class CourseRateIndex {
  private readonly all: Cumulative;
  private readonly byVenue = new Map<string, Cumulative>();

  constructor(races: readonly HistoricalRace[]) {
    this.all = buildCumulative(races);
    const groups = new Map<string, HistoricalRace[]>();
    for (const r of races) groups.set(r.venueId, [...(groups.get(r.venueId) ?? []), r]);
    groups.forEach((list, venueId) => this.byVenue.set(venueId, buildCumulative(list)));
  }

  private counts(c: Cumulative | undefined, before: string): CourseCounts {
    if (!c) return { wins: [0, 0, 0, 0, 0, 0], starts: [0, 0, 0, 0, 0, 0], races: 0 };
    const i = countBefore(c.dates, before);
    return { wins: c.wins[i]!, starts: c.starts[i]!, races: c.races[i]! };
  }

  /** before（YYYY-MM-DD）より前の全場の累計 */
  allBefore(before: string): CourseCounts {
    return this.counts(this.all, before);
  }

  /** before より前の指定場の累計 */
  venueBefore(venueId: string, before: string): CourseCounts {
    return this.counts(this.byVenue.get(venueId), before);
  }
}

/** HistoricalRace を一意にするキー */
export const historicalKey = (r: { date: string; venueId: string; raceNo: number }) => `${r.date}_${r.venueId}_${r.raceNo}`;

/** 確定レース（出走表つき）を軽量形式の過去レースに変換する。進入が不明なら枠なりとみなす */
export function raceToHistorical(race: Race): HistoricalRace | null {
  if (race.status !== 'finished' || !race.result) return null;
  const rankOf = new Map(race.result.finishOrder.map((b, i) => [b, i + 1]));
  const ex = race.exhibition;
  return {
    date: race.date,
    venueId: race.venueId,
    raceNo: race.raceNo,
    weather: ex?.weather ?? '',
    windSpeed: ex?.windSpeed ?? null,
    waveHeight: ex?.waveHeight ?? null,
    kimarite: race.result.kimarite,
    rows: race.entries.map((e) => ({
      course: ex?.entries.find((x) => x.boatNumber === e.boatNumber)?.startCourse ?? e.boatNumber,
      boatNumber: e.boatNumber,
      rank: rankOf.get(e.boatNumber) ?? null,
    })),
  };
}

/** 過去レースと確定レースを重複なく合わせる（統計・モデル用） */
export function mergeHistorical(historical: readonly HistoricalRace[], races: readonly Race[]): HistoricalRace[] {
  const seen = new Set(historical.map(historicalKey));
  const out = [...historical];
  for (const r of races) {
    const h = raceToHistorical(r);
    if (h && !seen.has(historicalKey(h))) {
      seen.add(historicalKey(h));
      out.push(h);
    }
  }
  return out;
}
