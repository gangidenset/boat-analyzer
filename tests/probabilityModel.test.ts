import { describe, expect, it } from 'vitest';
import { allCombos } from '../src/analytics/combinations';
import { evaluateModel } from '../src/analytics/evaluation';
import {
  combinationProbabilities,
  courseBaselineModel,
  courseWinRates,
  createModelContext,
  demoCompositeModel,
  expectedCourses,
  harvilleProbability,
  normalize,
} from '../src/analytics/probabilityModel';
import { makeExhibition, makeHistorical, makeRace } from './fixtures';

const sum = (xs: Iterable<number>) => [...xs].reduce((s, x) => s + x, 0);

/** 1コース1着が多い架空の過去データ（60レース） */
const historical = Array.from({ length: 60 }, (_, i) =>
  makeHistorical(i % 2 === 0 ? [1, 2, 3, 4, 5, 6] : [2, 1, 3, 4, 5, 6], { raceNo: (i % 12) + 1 }),
);
const ctx = createModelContext(historical);

describe('normalize', () => {
  it('合計1に正規化し、負値・NaNは0扱い', () => {
    expect(normalize([1, 1, 2])).toEqual([0.25, 0.25, 0.5]);
    expect(normalize([1, -1, Number.NaN, 1])).toEqual([0.5, 0, 0, 0.5]);
  });
  it('すべて0なら null（確率を捏造しない）', () => {
    expect(normalize([0, 0, 0])).toBeNull();
  });
});

describe('Harville 法', () => {
  const p = [0.4, 0.2, 0.15, 0.12, 0.08, 0.05];
  it('単純な計算例', () => {
    expect(harvilleProbability(p, [1, 2])).toBeCloseTo(0.4 * (0.2 / 0.6), 12);
  });
  it.each(['win', 'exacta', 'trifecta'] as const)('%s の全買い目確率の合計は1', (bt) => {
    expect(sum(combinationProbabilities(p, bt).values())).toBeCloseTo(1, 10);
  });
  it('確率0の艇を含む買い目は0', () => {
    const q = [0.5, 0.3, 0.2, 0, 0, 0];
    expect(harvilleProbability(q, [4, 1, 2])).toBe(0);
    expect(harvilleProbability(q, [1, 2, 4])).toBe(0);
    expect(sum(allCombos('trifecta').map((c) => harvilleProbability(q, c)))).toBeCloseTo(1, 10);
  });
});

describe('コース別1着率', () => {
  it('過去に1着0回のコースも確率は厳密な0にしない（ラプラス平滑化）', () => {
    const r = courseWinRates(ctx.courseIndex, '12', '2026-10-22');
    expect(r.ok && r.value.rates[5]).toBeGreaterThan(0);
  });
  it('過去データが不足していれば推定しない（insufficient_data）', () => {
    const r = courseWinRates(createModelContext(historical.slice(0, 5)).courseIndex, '12', '2026-10-22');
    expect(!r.ok && r.error.code).toBe('insufficient_data');
    const m = courseBaselineModel.predictWin(makeRace(), createModelContext([]));
    expect(m.ok).toBe(false);
  });
  it('1・2コースが高く、データのないコースは全場平均に寄せる', () => {
    const r = courseWinRates(ctx.courseIndex, '12', '2026-10-22');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rates[0]).toBeGreaterThan(r.value.rates[2]!);
    expect(r.value.sampleSize).toBe(60);
  });
});

describe('予測モデル', () => {
  it.each([courseBaselineModel, demoCompositeModel])('$id: 1着確率の合計は1、範囲は0〜1', (model) => {
    const r = model.predictWin(makeRace({ exhibition: makeExhibition([6.7, 6.72, 6.68, 6.75, 6.8, 6.7]) }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(sum(r.value.probabilities)).toBeCloseTo(1, 10);
    r.value.probabilities.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  it('欠場艇の確率は0で、残りで合計1', () => {
    const race = makeRace();
    race.entries[5] = { ...race.entries[5]!, status: 'absent' };
    const r = demoCompositeModel.predictWin(race, ctx);
    expect(r.ok && r.value.probabilities[5]).toBe(0);
    expect(r.ok && sum(r.value.probabilities)).toBeCloseTo(1, 10);
  });

  it('展示タイムが速い艇ほど確率が上がる（他条件同一）', () => {
    const race = makeRace({ exhibition: makeExhibition([6.8, 6.8, 6.6, 6.8, 6.8, 6.8]) });
    const base = courseBaselineModel.predictWin(race, ctx);
    const comp = demoCompositeModel.predictWin(race, ctx);
    expect(base.ok && comp.ok).toBe(true);
    if (base.ok && comp.ok) expect(comp.value.probabilities[2]!).toBeGreaterThan(base.value.probabilities[2]!);
  });

  it('欠損データは0扱いせず、未使用要素として報告する', () => {
    const race = makeRace({ exhibition: makeExhibition([6.7, null, 6.7, 6.7, 6.7, 6.7]) });
    race.entries[0] = { ...race.entries[0]!, racer: { ...race.entries[0]!.racer, nationalWinRate: null } };
    const r = demoCompositeModel.predictWin(race, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.missingFactors).toContain('展示タイム（2号艇）');
    expect(r.value.missingFactors).toContain('全国勝率（1号艇）');
    // 展示未発表の場合
    const r2 = demoCompositeModel.predictWin(makeRace(), ctx);
    expect(r2.ok && r2.value.missingFactors).toContain('展示情報（未発表）');
  });

  it('対象レースの日付以降の過去データは使わない（データ漏れ防止）', () => {
    // 10/22 の過去データだけでは、10/22 のレースは推定しない
    const sameDay = historical.map((h) => ({ ...h, date: '2026-10-22' }));
    const r = courseBaselineModel.predictWin(makeRace({ date: '2026-10-22' }), createModelContext(sameDay));
    expect(!r.ok && r.error.code).toBe('insufficient_data');
    const next = courseBaselineModel.predictWin(makeRace({ date: '2026-10-23' }), createModelContext(sameDay));
    expect(next.ok).toBe(true);
  });

  it('コース別基準モデルは使用要素に選手・展示を含めない', () => {
    const r = courseBaselineModel.predictWin(makeRace(), ctx);
    expect(r.ok && r.value.usedFactors).toEqual(['場・コース別1着率']);
    expect(r.ok && r.value.missingFactors).toEqual(['展示進入コース（枠なりと仮定）']);
  });

  it('進入コース：展示の進入が揃っていれば使い、欠損があれば枠なり', () => {
    const ex = makeExhibition([6.7, 6.7, 6.7, 6.7, 6.7, 6.7]);
    ex.entries[0]!.startCourse = 2;
    ex.entries[1]!.startCourse = 1;
    expect(expectedCourses(makeRace({ exhibition: ex })).courses).toEqual([2, 1, 3, 4, 5, 6]);
    ex.entries[2]!.startCourse = null;
    expect(expectedCourses(makeRace({ exhibition: ex })).fromExhibition).toBe(false);
  });
});

describe('モデル検証', () => {
  it('確定レースのみ評価し、指標を計算する', () => {
    const finished = makeRace({
      status: 'finished',
      result: { finishOrder: [1, 2, 3, 4, 5, 6], kimarite: '逃げ', payouts: { win: null, exacta: null, trifecta: null } },
    });
    const ev = evaluateModel(courseBaselineModel, [finished, makeRace({ id: 'R2' })], ctx);
    expect(ev.n).toBe(1);
    expect(ev.top1HitRate).toBe(1);
    expect(ev.brierScore).toBeGreaterThan(0);
    expect(ev.logLoss).toBeGreaterThan(0);
  });
  it('評価対象がなければ指標は null', () => {
    const ev = evaluateModel(courseBaselineModel, [], ctx);
    expect(ev).toMatchObject({ n: 0, brierScore: null, logLoss: null, top1HitRate: null });
  });
});
