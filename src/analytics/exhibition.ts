import type { Exhibition, ExhibitionEntry, Race } from '../domain/types';

/**
 * 展示情報の集計。欠損値（null）は 0 で埋めず、順位・平均の計算から除外する。
 */

export type ExhibitionMetricKey = 'exhibitionTime' | 'straightTime' | 'turnTime' | 'lapTime' | 'startTiming';

export interface ExhibitionMetricDef {
  key: ExhibitionMetricKey;
  label: string;
  unit: string;
  /** すべて「小さいほど良い」指標 */
  lowerIsBetter: true;
  digits: number;
}

export const EXHIBITION_METRICS: readonly ExhibitionMetricDef[] = [
  { key: 'exhibitionTime', label: '展示タイム', unit: '秒', lowerIsBetter: true, digits: 2 },
  { key: 'straightTime', label: '直線タイム', unit: '秒', lowerIsBetter: true, digits: 2 },
  { key: 'turnTime', label: '回り足（一周・ターン）', unit: '秒', lowerIsBetter: true, digits: 2 },
  { key: 'lapTime', label: '周回展示', unit: '秒', lowerIsBetter: true, digits: 2 },
  { key: 'startTiming', label: '展示ST', unit: '秒', lowerIsBetter: true, digits: 2 },
];

export interface MetricSummary {
  key: ExhibitionMetricKey;
  /** index 0 = 1号艇。欠損は null */
  values: (number | null)[];
  /** 1が最良。同値は同順位。欠損は null */
  ranks: (number | null)[];
  /** 最良値との差（秒）。欠損は null */
  diffFromBest: (number | null)[];
  best: number | null;
  average: number | null;
  availableCount: number;
  missingCount: number;
}

/** 同値は同順位（1,2,2,4…）。null は順位なし */
export function rankAscending(values: readonly (number | null)[]): (number | null)[] {
  return values.map((v) => {
    if (v === null) return null;
    return values.filter((o): o is number => o !== null && o < v).length + 1;
  });
}

export function summarizeMetric(
  entries: readonly ExhibitionEntry[],
  key: ExhibitionMetricKey,
  excludeBoats: readonly number[] = [],
): MetricSummary {
  const values = [1, 2, 3, 4, 5, 6].map((boat) => {
    if (excludeBoats.includes(boat)) return null;
    const v = entries.find((e) => e.boatNumber === boat)?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
  const available = values.filter((v): v is number => v !== null);
  const best = available.length ? Math.min(...available) : null;
  return {
    key,
    values,
    ranks: rankAscending(values),
    diffFromBest: values.map((v) => (v === null || best === null ? null : v - best)),
    best,
    average: available.length ? available.reduce((s, v) => s + v, 0) / available.length : null,
    availableCount: available.length,
    missingCount: values.length - available.length,
  };
}

export interface ExhibitionSummary {
  metrics: MetricSummary[];
  /** 各艇の平均順位（集計できた指標のみ）。全指標が欠損なら null */
  averageRank: (number | null)[];
}

export function summarizeExhibition(exhibition: Exhibition, race?: Race): ExhibitionSummary {
  const absent = race ? race.entries.filter((e) => e.status === 'absent').map((e) => e.boatNumber) : [];
  const metrics = EXHIBITION_METRICS.map((m) => summarizeMetric(exhibition.entries, m.key, absent));
  const averageRank = [0, 1, 2, 3, 4, 5].map((i) => {
    const ranks = metrics.map((m) => m.ranks[i]).filter((r): r is number => r !== null && r !== undefined);
    return ranks.length ? ranks.reduce((s, r) => s + r, 0) / ranks.length : null;
  });
  return { metrics, averageRank };
}

/** 展示タイムの最速と最遅の差（秒）。2艇以上の値がなければ null */
export function exhibitionTimeSpread(exhibition: Exhibition | null): number | null {
  if (!exhibition) return null;
  const v = exhibition.entries.map((e) => e.exhibitionTime).filter((t): t is number => t !== null);
  return v.length >= 2 ? Math.max(...v) - Math.min(...v) : null;
}
