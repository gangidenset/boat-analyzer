import { describe, expect, it } from 'vitest';
import { exhibitionTimeSpread, rankAscending, summarizeExhibition, summarizeMetric } from '../src/analytics/exhibition';
import { makeExhibition, makeRace } from './fixtures';

describe('展示情報集計', () => {
  it('順位：小さいほど上位、同値は同順位、欠損は順位なし', () => {
    expect(rankAscending([6.7, 6.65, 6.7, null, 6.8, 6.6])).toEqual([3, 2, 3, null, 5, 1]);
  });

  it('欠損値を0で埋めず、平均・最良から除外する', () => {
    const ex = makeExhibition([6.7, null, 6.6, 6.8, null, 6.7]);
    const m = summarizeMetric(ex.entries, 'exhibitionTime');
    expect(m.values).toEqual([6.7, null, 6.6, 6.8, null, 6.7]);
    expect(m.best).toBe(6.6);
    expect(m.average).toBeCloseTo((6.7 + 6.6 + 6.8 + 6.7) / 4, 10);
    expect(m.availableCount).toBe(4);
    expect(m.missingCount).toBe(2);
    expect(m.diffFromBest[1]).toBeNull();
    expect(m.diffFromBest[3]).toBeCloseTo(0.2, 10);
  });

  it('全艇欠損の指標は best/average が null', () => {
    const ex = makeExhibition([6.7, 6.7, 6.7, 6.7, 6.7, 6.7]);
    const m = summarizeMetric(ex.entries, 'straightTime');
    expect(m).toMatchObject({ best: null, average: null, availableCount: 0, missingCount: 6 });
    expect(m.ranks.every((r) => r === null)).toBe(true);
  });

  it('欠場艇は集計から除外する', () => {
    const race = makeRace();
    race.entries[0] = { ...race.entries[0]!, status: 'absent' };
    const s = summarizeExhibition(makeExhibition([6.5, 6.7, 6.8, 6.9, 7.0, 7.1]), race);
    const t = s.metrics.find((m) => m.key === 'exhibitionTime')!;
    expect(t.values[0]).toBeNull();
    expect(t.best).toBe(6.7);
    expect(t.ranks[1]).toBe(1);
  });

  it('平均順位は欠損指標を除いて計算し、全欠損なら null', () => {
    const ex = makeExhibition([6.6, 6.7, 6.8, 6.9, 7.0, null]);
    ex.entries.forEach((e) => (e.startTiming = null));
    const s = summarizeExhibition(ex);
    expect(s.averageRank[0]).toBe(1);
    expect(s.averageRank[5]).toBeNull();
  });

  it('展示タイム差（最遅−最速）', () => {
    expect(exhibitionTimeSpread(makeExhibition([6.6, null, 6.9, 6.7, 6.7, 6.7]))).toBeCloseTo(0.3, 10);
    expect(exhibitionTimeSpread(makeExhibition([6.6, null, null, null, null, null]))).toBeNull();
    expect(exhibitionTimeSpread(null)).toBeNull();
  });
});
