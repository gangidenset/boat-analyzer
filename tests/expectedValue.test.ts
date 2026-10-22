import { describe, expect, it } from 'vitest';
import {
  breakEvenOdds,
  calculateExpectedValue,
  HIGH_ODDS_WARNING_THRESHOLD,
  validateOdds,
  validateProbability,
} from '../src/analytics/expectedValue';

describe('期待値計算', () => {
  it('期待払戻倍率 = 確率 × オッズ、期待収益率 = 確率 × オッズ − 1', () => {
    const r = calculateExpectedValue(0.25, 5.0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.expectedPayoutRatio).toBeCloseTo(1.25, 10);
    expect(r.value.expectedReturnRate).toBeCloseTo(0.25, 10);
    expect(r.value.impliedProbability).toBeCloseTo(0.2, 10);
  });

  it('期待収益率がマイナスになるケース', () => {
    const r = calculateExpectedValue(0.1, 4.0);
    expect(r.ok && r.value.expectedReturnRate).toBeCloseTo(-0.6, 10);
  });

  it('損益分岐（期待収益率 0）', () => {
    const r = calculateExpectedValue(0.5, 2.0);
    expect(r.ok && r.value.expectedReturnRate).toBeCloseTo(0, 12);
  });

  it('確率 0 は期待収益率 −100%', () => {
    const r = calculateExpectedValue(0, 50);
    expect(r.ok && r.value.expectedReturnRate).toBe(-1);
  });

  it('確率 1 は期待収益率 = オッズ − 1', () => {
    const r = calculateExpectedValue(1, 1.3);
    expect(r.ok && r.value.expectedReturnRate).toBeCloseTo(0.3, 10);
  });
});

describe('確率の境界値', () => {
  it.each([0, 1, 0.5, 1e-12])('%s は有効', (p) => {
    expect(validateProbability(p).ok).toBe(true);
  });

  it('浮動小数点誤差（1 + 1e-12）は 1 に丸める', () => {
    const r = validateProbability(1 + 1e-12);
    expect(r.ok && r.value).toBe(1);
  });

  it.each([-0.01, 1.01, 2, -1])('%s は範囲外エラー', (p) => {
    const r = validateProbability(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('out_of_range');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, '0.5'])('%s は数値エラー', (p) => {
    const r = validateProbability(p);
    expect(!r.ok && r.error.code).toBe('not_a_number');
  });

  it('null / undefined は欠損エラー', () => {
    for (const v of [null, undefined]) {
      const r = validateProbability(v);
      expect(!r.ok && r.error.code).toBe('missing');
    }
  });

  it('確率エラー時は field=probability を返す', () => {
    const r = calculateExpectedValue(1.5, 3);
    expect(!r.ok && r.error.field).toBe('probability');
  });
});

describe('異常オッズ', () => {
  it('1.0倍は有効（元返し）', () => {
    const r = calculateExpectedValue(1, 1.0);
    expect(r.ok && r.value.expectedReturnRate).toBe(0);
  });

  it.each([0.9, 0, -5])('%s倍は最低オッズ未満エラー', (o) => {
    const r = validateOdds(o);
    expect(!r.ok && r.error.code).toBe('below_minimum');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '12.3'])('%s は数値エラー', (o) => {
    const r = validateOdds(o);
    expect(!r.ok && r.error.code).toBe('not_a_number');
  });

  it('null（未発売・欠場）は欠損エラーで、期待値を計算しない', () => {
    const r = calculateExpectedValue(0.3, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.field).toBe('odds');
      expect(r.error.code).toBe('missing');
    }
  });

  it('極端に高いオッズは計算するが警告を付ける', () => {
    const r = calculateExpectedValue(0.0001, HIGH_ODDS_WARNING_THRESHOLD);
    expect(r.ok && r.value.warnings).toContain('unusually_high');
    const normal = calculateExpectedValue(0.0001, 9999.9);
    expect(normal.ok && normal.value.warnings).toEqual([]);
  });
});

describe('市場との乖離警告', () => {
  it('期待払戻倍率が2倍以上（推定確率がオッズ逆算確率の2倍以上）で要検証', () => {
    const r = calculateExpectedValue(0.1, 20);
    expect(r.ok && r.value.warnings).toContain('model_market_divergence');
    const r2 = calculateExpectedValue(0.1, 19.9);
    expect(r2.ok && r2.value.warnings).not.toContain('model_market_divergence');
  });
});

describe('損益分岐オッズ', () => {
  it('1/確率', () => {
    expect(breakEvenOdds(0.25)).toBeCloseTo(4, 10);
  });
  it('確率0・不正値は null', () => {
    expect(breakEvenOdds(0)).toBeNull();
    expect(breakEvenOdds(-1)).toBeNull();
  });
});
