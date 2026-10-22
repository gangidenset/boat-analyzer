import { err, ok, type Result } from '../domain/types';

/**
 * 期待値計算モジュール（UIから独立した純粋関数）
 *
 * 前提: オッズ = 的中時の総払戻倍率（100円で的中すると odds×100円が戻る）
 *   期待払戻倍率 = 推定的中確率 × オッズ
 *   期待収益率   = 推定的中確率 × オッズ − 1
 * 確率は 0〜1 で扱う。
 *
 * 注意: 推定的中確率が正確である保証はない。期待収益率がプラスでも利益は保証されない。
 */

/** 浮動小数点誤差を許容する幅（確率の合計計算で 1.0000000001 等が出るため） */
const PROBABILITY_EPSILON = 1e-9;
/** 競艇の払戻は最低100円（=1.0倍）のため、1.0倍未満は異常値として扱う */
export const MIN_VALID_ODDS = 1.0;
/** これ以上のオッズは計算するが「異常に高い」警告を付ける */
export const HIGH_ODDS_WARNING_THRESHOLD = 10000;

export type ProbabilityErrorCode = 'missing' | 'not_a_number' | 'out_of_range';
export type OddsErrorCode = 'missing' | 'not_a_number' | 'below_minimum';

export interface ValidationError<C extends string> {
  code: C;
  message: string;
}

export type ProbabilityError = ValidationError<ProbabilityErrorCode>;
export type OddsError = ValidationError<OddsErrorCode>;

/**
 * 期待払戻倍率がこの値以上（= 推定確率がオッズ逆算確率の2倍以上）なら、
 * 「市場との乖離が大きい＝モデル誤差の可能性が高い」として要検証の警告を付ける。
 */
export const DIVERGENCE_WARNING_RATIO = 2;

export type OddsWarning = 'unusually_high' | 'model_market_divergence';

export function validateProbability(p: unknown): Result<number, ProbabilityError> {
  if (p === null || p === undefined) return err({ code: 'missing', message: '推定確率がありません' });
  if (typeof p !== 'number' || !Number.isFinite(p)) {
    return err({ code: 'not_a_number', message: '推定確率が数値ではありません' });
  }
  if (p < -PROBABILITY_EPSILON || p > 1 + PROBABILITY_EPSILON) {
    return err({ code: 'out_of_range', message: `推定確率は0〜1の範囲である必要があります（値: ${p}）` });
  }
  return ok(Math.min(1, Math.max(0, p)));
}

export function validateOdds(o: unknown): Result<{ odds: number; warnings: OddsWarning[] }, OddsError> {
  if (o === null || o === undefined) return err({ code: 'missing', message: 'オッズがありません（未発売・欠場など）' });
  if (typeof o !== 'number' || !Number.isFinite(o)) {
    return err({ code: 'not_a_number', message: 'オッズが数値ではありません' });
  }
  if (o < MIN_VALID_ODDS) {
    return err({ code: 'below_minimum', message: `オッズが${MIN_VALID_ODDS.toFixed(1)}倍未満の異常値です（値: ${o}）` });
  }
  const warnings: OddsWarning[] = o >= HIGH_ODDS_WARNING_THRESHOLD ? ['unusually_high'] : [];
  return ok({ odds: o, warnings });
}

export interface ExpectedValue {
  probability: number;
  odds: number;
  /** 期待払戻倍率 = p × odds */
  expectedPayoutRatio: number;
  /** 期待収益率 = p × odds − 1 */
  expectedReturnRate: number;
  /** オッズから逆算した単純な確率（1/odds）。控除率を含むため合計は1を超えない */
  impliedProbability: number;
  warnings: OddsWarning[];
}

export type ExpectedValueError =
  | ({ field: 'probability' } & ProbabilityError)
  | ({ field: 'odds' } & OddsError);

export function calculateExpectedValue(probability: unknown, odds: unknown): Result<ExpectedValue, ExpectedValueError> {
  const p = validateProbability(probability);
  if (!p.ok) return err({ field: 'probability', ...p.error });
  const o = validateOdds(odds);
  if (!o.ok) return err({ field: 'odds', ...o.error });

  const expectedPayoutRatio = p.value * o.value.odds;
  const warnings: OddsWarning[] = [...o.value.warnings];
  if (expectedPayoutRatio >= DIVERGENCE_WARNING_RATIO) warnings.push('model_market_divergence');
  return ok({
    probability: p.value,
    odds: o.value.odds,
    expectedPayoutRatio,
    expectedReturnRate: expectedPayoutRatio - 1,
    impliedProbability: 1 / o.value.odds,
    warnings,
  });
}

/** 期待収益率が0となるオッズ（損益分岐オッズ）。確率0のときは null */
export function breakEvenOdds(probability: number): number | null {
  const p = validateProbability(probability);
  if (!p.ok || p.value === 0) return null;
  return 1 / p.value;
}
