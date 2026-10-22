import type { BetType, Race } from '../domain/types';
import { allCombos, comboKey } from './combinations';
import { calculateExpectedValue, type ExpectedValueError, type OddsWarning } from './expectedValue';
import { harvilleProbability } from './probabilityModel';

/** 買い目ごとの期待値分析結果 */
export interface BetCandidate {
  betType: BetType;
  combination: string;
  odds: number | null;
  probability: number;
  expectedPayoutRatio: number | null;
  expectedReturnRate: number | null;
  impliedProbability: number | null;
  warnings: OddsWarning[];
  /** 計算できなかった理由（オッズ欠損・異常値など） */
  error: ExpectedValueError | null;
}

export function buildCandidates(race: Race, winProbs: readonly number[], betTypes: readonly BetType[]): BetCandidate[] {
  const out: BetCandidate[] = [];
  for (const betType of betTypes) {
    const table = race.odds?.[betType];
    for (const combo of allCombos(betType)) {
      const key = comboKey(combo);
      const probability = harvilleProbability(winProbs, combo);
      const odds = table?.[key] ?? null;
      const ev = calculateExpectedValue(probability, odds);
      out.push({
        betType,
        combination: key,
        odds: typeof odds === 'number' ? odds : null,
        probability,
        expectedPayoutRatio: ev.ok ? ev.value.expectedPayoutRatio : null,
        expectedReturnRate: ev.ok ? ev.value.expectedReturnRate : null,
        impliedProbability: ev.ok ? ev.value.impliedProbability : null,
        warnings: ev.ok ? ev.value.warnings : [],
        error: ev.ok ? null : ev.error,
      });
    }
  }
  return out;
}

export interface CandidateFilter {
  betTypes: BetType[];
  /** 期待収益率の下限（例 0.1 = +10%）。null で制限なし */
  minExpectedReturnRate: number | null;
  /** 推定確率の下限（0〜1） */
  minProbability: number;
  /** オッズ上限。null で制限なし */
  maxOdds: number | null;
  /** 計算不可（オッズ欠損等）も表示するか */
  includeInvalid: boolean;
}

export const DEFAULT_CANDIDATE_FILTER: CandidateFilter = {
  betTypes: ['win', 'exacta', 'trifecta'],
  minExpectedReturnRate: null,
  minProbability: 0,
  maxOdds: null,
  includeInvalid: false,
};

/** 閾値比較の許容誤差（0.2×6−1 = 0.19999999999999996 のような誤差で境界値を落とさない） */
const THRESHOLD_EPSILON = 1e-9;

export function filterCandidates(cands: readonly BetCandidate[], f: CandidateFilter): BetCandidate[] {
  return cands.filter((c) => {
    if (!f.betTypes.includes(c.betType)) return false;
    if (c.error) return f.includeInvalid;
    if (c.probability < f.minProbability - THRESHOLD_EPSILON) return false;
    if (f.maxOdds !== null && c.odds !== null && c.odds > f.maxOdds + THRESHOLD_EPSILON) return false;
    if (f.minExpectedReturnRate !== null && (c.expectedReturnRate ?? -Infinity) < f.minExpectedReturnRate - THRESHOLD_EPSILON)
      return false;
    return true;
  });
}

export type CandidateSortKey = 'expectedReturnRate' | 'probability' | 'odds' | 'combination';

export function sortCandidates(cands: readonly BetCandidate[], key: CandidateSortKey): BetCandidate[] {
  const val = (c: BetCandidate): number => {
    if (key === 'probability') return c.probability;
    if (key === 'odds') return c.odds ?? -Infinity;
    return c.expectedReturnRate ?? -Infinity;
  };
  if (key === 'combination') {
    return [...cands].sort((a, b) => a.betType.localeCompare(b.betType) || a.combination.localeCompare(b.combination));
  }
  // 計算不可は常に末尾
  return [...cands].sort((a, b) => Number(!!a.error) - Number(!!b.error) || val(b) - val(a));
}

export interface RaceCandidate extends BetCandidate {
  raceId: string;
}

/** 複数レースから条件に合う候補を集める（ダッシュボード用） */
export function findCandidatesAcrossRaces(
  races: readonly Race[],
  winProbsByRace: ReadonlyMap<string, readonly number[] | null>,
  filter: CandidateFilter,
  limit: number,
): RaceCandidate[] {
  const out: RaceCandidate[] = [];
  for (const race of races) {
    const probs = winProbsByRace.get(race.id);
    if (!probs || !race.odds) continue;
    const found = filterCandidates(buildCandidates(race, probs, filter.betTypes), { ...filter, includeInvalid: false });
    for (const c of found) out.push({ ...c, raceId: race.id });
  }
  return sortCandidates(out, 'expectedReturnRate').slice(0, limit) as RaceCandidate[];
}
