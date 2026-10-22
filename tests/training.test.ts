import { describe, expect, it } from 'vitest';
import { CourseRateIndex, mergeHistorical, raceToHistorical } from '../src/analytics/courseRates';
import { createModelContext, scoreProbabilities, type Coefficients } from '../src/analytics/probabilityModel';
import { buildSamples, fitConditionalLogit, splitByDate, trainModel, MIN_TRAIN_RACES } from '../src/analytics/training';
import { sampleDataSource } from '../src/data/sampleDataSource';
import type { Race } from '../src/domain/types';
import { mergeRecords } from '../src/state/AppState';
import { makeExhibition, makeHistorical, makeRace } from './fixtures';

/** 再現性のある乱数 */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const history = Array.from({ length: 60 }, (_, i) => makeHistorical(i % 3 === 0 ? [2, 1, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6], { raceNo: (i % 12) + 1 }));

/** 既知の係数から勝者を抽選した架空レース */
function synthRaces(n: number, truth: Coefficients, seed = 1): Race[] {
  const r = rng(seed);
  const ctx = createModelContext(history);
  const grades = ['A1', 'A2', 'B1', 'B2'] as const;
  return Array.from({ length: n }, (_, k) => {
    const race = makeRace({
      id: `S${k}`,
      date: `2026-11-${String(1 + Math.floor(k / 40)).padStart(2, '0')}`,
      exhibition: makeExhibition([0, 1, 2, 3, 4, 5].map(() => Math.round((6.6 + r() * 0.3) * 100) / 100)),
    });
    race.entries = race.entries.map((e) => ({
      ...e,
      racer: { ...e.racer, grade: grades[Math.floor(r() * 4)]!, nationalWinRate: Math.round((3 + r() * 5) * 100) / 100 },
      motor: { ...e.motor, twoRate: Math.round((25 + r() * 25) * 10) / 10 },
    }));
    // 真の係数で確率を出し、勝者を抽選
    const f = buildSamples([{ ...race, status: 'finished', result: { finishOrder: [1], kimarite: '', payouts: { win: null, exacta: null, trifecta: null } } }], ctx).samples[0]!;
    const p = scoreProbabilities(f.rows, truth);
    let x = r();
    let winner = 0;
    for (; winner < 5; winner++) {
      x -= p[winner]!;
      if (x <= 0) break;
    }
    const order = [winner + 1, ...[1, 2, 3, 4, 5, 6].filter((b) => b !== winner + 1)];
    return { ...race, status: 'finished', result: { finishOrder: order, kimarite: '', payouts: { win: null, exacta: null, trifecta: null } } };
  });
}

describe('場・コース別の累計索引', () => {
  it('指定日より前だけを数える', () => {
    const idx = new CourseRateIndex([
      makeHistorical([1, 2, 3, 4, 5, 6], { date: '2026-10-01' }),
      makeHistorical([2, 1, 3, 4, 5, 6], { date: '2026-10-02', venueId: '24' }),
    ]);
    expect(idx.allBefore('2026-10-01').races).toBe(0);
    expect(idx.allBefore('2026-10-02')).toMatchObject({ races: 1, wins: [1, 0, 0, 0, 0, 0] });
    expect(idx.allBefore('2026-10-03').wins).toEqual([1, 1, 0, 0, 0, 0]);
    expect(idx.venueBefore('24', '2026-10-03').races).toBe(1);
    expect(idx.venueBefore('99', '2026-10-03').races).toBe(0);
  });
  it('確定レースを過去レースに変換して重複なく合わせる', () => {
    const fin = makeRace({ status: 'finished', result: { finishOrder: [2, 1, 3], kimarite: '差し', payouts: { win: null, exacta: null, trifecta: null } } });
    const h = raceToHistorical(fin)!;
    expect(h.rows.map((r) => r.rank)).toEqual([2, 1, 3, null, null, null]);
    expect(raceToHistorical(makeRace())).toBeNull();
    const merged = mergeHistorical([h], [fin]);
    expect(merged).toHaveLength(1);
  });
});

describe('学習（条件付きロジット）', () => {
  const truth: Coefficients = { logCourse: 1, gradeA1: 0.8, gradeA2: 0.3, gradeB2: -0.6, nationalWinRate: 0.3, motorTwoRate: 0.2, exhibitionTime: -0.8 };

  it('既知の係数から作ったデータで、係数の向きと大きさをおおむね再現する', () => {
    const races = synthRaces(1500, truth);
    const { samples } = buildSamples(races, createModelContext(history));
    const fit = fitConditionalLogit(samples, { iterations: 500 });
    expect(fit.gradeA1).toBeGreaterThan(0.4);
    expect(fit.gradeB2).toBeLessThan(-0.2);
    expect(fit.nationalWinRate).toBeGreaterThan(0.1);
    expect(fit.exhibitionTime).toBeLessThan(-0.3);
    expect(Math.abs(fit.logCourse - 1)).toBeLessThan(0.5);
  });

  it('学習用と検証用を日付で分け、同じ日を両方に入れない', () => {
    const races = synthRaces(400, truth, 2);
    const { train, validate, splitDate } = splitByDate(races);
    expect(train.length + validate.length).toBe(400);
    expect(train.every((r) => r.date < splitDate!)).toBe(true);
    expect(validate.every((r) => r.date >= splitDate!)).toBe(true);
    expect(train.length / 400).toBeGreaterThan(0.6);
  });

  it('件数が足りなければ学習しない', () => {
    const r = trainModel(synthRaces(50, truth, 3), createModelContext(history), { dataSource: 'actual', isDemoData: false, trainedAt: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(String(MIN_TRAIN_RACES));
  });

  it('十分なデータでは検証期間で基準モデルより改善し、実データなら検証済みになる', () => {
    const r = trainModel(synthRaces(2000, truth, 4), createModelContext(history), { dataSource: 'actual', isDemoData: false, trainedAt: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.improvedOverBaseline).toBe(true);
    expect(r.report.validated).toBe(true);
    const ll = (id: string) => r.report.metrics.find((m) => m.modelId === id)!.logLoss!;
    expect(ll('trained')).toBeLessThan(ll('course-baseline'));
  });

  it('デモデータでの学習は検証済みにしない', () => {
    const r = trainModel(synthRaces(2000, truth, 5), createModelContext(history), { dataSource: 'sample', isDemoData: true, trainedAt: 'x' });
    expect(r.ok && r.report.validated).toBe(false);
  });

  it('同梱サンプルデータで学習できる（デモのため未検証）', async () => {
    const d = await sampleDataSource.load();
    if (!d.ok) throw new Error('load');
    const ctx = createModelContext(mergeHistorical(d.value.historicalRaces, d.value.races));
    const r = trainModel(d.value.races, ctx, { dataSource: 'sample', isDemoData: true, trainedAt: 'x' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.report.validated).toBe(false);
      expect(r.report.trainRaces).toBeGreaterThanOrEqual(MIN_TRAIN_RACES);
    }
  });
});

describe('分析記録の読み込み（マージ）', () => {
  it('同じIDは追加しない', () => {
    const base = { createdAt: '2026-10-21T10:00:00+09:00', source: 'sample' as const, raceId: 'R', raceLabel: 'L', modelId: 'm', betType: 'win' as const, combination: '1', odds: 2, probability: 0.5, expectedReturnRate: 0, stake: 100, oddsFetchedAt: null };
    const merged = mergeRecords([{ ...base, id: 'a' }], [{ ...base, id: 'a' }, { ...base, id: 'b', createdAt: '2026-10-22T10:00:00+09:00' }]);
    expect(merged.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
