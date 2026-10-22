import { describe, expect, it } from 'vitest';
import {
  buildCandidates,
  DEFAULT_CANDIDATE_FILTER,
  filterCandidates,
  findCandidatesAcrossRaces,
  sortCandidates,
} from '../src/analytics/candidates';
import type { Odds } from '../src/domain/types';
import { makeRace } from './fixtures';

const probs = [0.5, 0.2, 0.1, 0.1, 0.05, 0.05];
const odds: Odds = {
  fetchedAt: '2026-10-22T09:00:00+09:00',
  win: { '1': 2.4, '2': 5.5, '3': null, '4': 0, '5': Number.NaN, '6': 30 },
  exacta: { '1-2': 4.0 },
  trifecta: {},
};

describe('買い目候補', () => {
  const race = makeRace({ odds });
  const cands = buildCandidates(race, probs, ['win']);

  it('期待値を計算し、欠損・異常オッズは算出不可にする', () => {
    const byCombo = Object.fromEntries(cands.map((c) => [c.combination, c]));
    expect(byCombo['1']!.expectedReturnRate).toBeCloseTo(0.5 * 2.4 - 1, 10);
    expect(byCombo['2']!.expectedPayoutRatio).toBeCloseTo(1.1, 10);
    expect(byCombo['3']!.error?.code).toBe('missing');
    expect(byCombo['4']!.error?.code).toBe('below_minimum');
    expect(byCombo['5']!.error?.code).toBe('not_a_number');
    expect(byCombo['3']!.expectedReturnRate).toBeNull();
  });

  it('オッズ表が無いレースは全買い目が算出不可', () => {
    const c = buildCandidates(makeRace(), probs, ['trifecta']);
    expect(c).toHaveLength(120);
    expect(c.every((x) => x.error?.code === 'missing')).toBe(true);
  });

  it('浮動小数点誤差で境界値（期待収益率 ちょうど20%）を落とさない', () => {
    // 0.5 × 2.4 − 1 = 0.19999999999999996
    const f = { ...DEFAULT_CANDIDATE_FILTER, betTypes: ['win' as const], minExpectedReturnRate: 0.2 };
    expect(filterCandidates(cands, f).map((c) => c.combination)).toContain('1');
  });

  it('フィルター：期待収益率下限・確率下限・オッズ上限・算出不可', () => {
    const f = { ...DEFAULT_CANDIDATE_FILTER, betTypes: ['win' as const] };
    expect(filterCandidates(cands, f).map((c) => c.combination)).toEqual(['1', '2', '6']);
    expect(filterCandidates(cands, { ...f, includeInvalid: true })).toHaveLength(6);
    expect(filterCandidates(cands, { ...f, minExpectedReturnRate: 0.2 }).map((c) => c.combination)).toEqual(['1', '6']);
    expect(filterCandidates(cands, { ...f, minProbability: 0.15 }).map((c) => c.combination)).toEqual(['1', '2']);
    expect(filterCandidates(cands, { ...f, maxOdds: 10 }).map((c) => c.combination)).toEqual(['1', '2']);
    expect(filterCandidates(cands, { ...f, betTypes: ['exacta'] })).toHaveLength(0);
  });

  it('並び替え：期待収益率順、算出不可は末尾', () => {
    const sorted = sortCandidates(cands, 'expectedReturnRate');
    expect(sorted.map((c) => c.combination).slice(0, 3)).toEqual(['6', '1', '2']);
    expect(sorted.slice(3).every((c) => c.error)).toBe(true);
    expect(sortCandidates(cands, 'probability')[0]!.combination).toBe('1');
  });

  it('複数レースから候補を抽出（確率なし・オッズなしのレースは除外）', () => {
    const r2 = makeRace({ id: 'R2' });
    const found = findCandidatesAcrossRaces(
      [race, r2, makeRace({ id: 'R3', odds })],
      new Map([
        ['R1', probs],
        ['R2', probs],
        ['R3', null],
      ]),
      { ...DEFAULT_CANDIDATE_FILTER, minExpectedReturnRate: 0.1 },
      10,
    );
    expect(found.map((c) => `${c.raceId}:${c.combination}`)).toEqual(['R1:6', 'R1:1', 'R1:2']);
  });
});
