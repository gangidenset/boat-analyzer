import { z } from 'zod';
import type { Race } from '../domain/types';
import { evaluateModel, type ModelEvaluation } from './evaluation';
import {
  courseBaselineModel,
  demoCompositeModel,
  extractFeatures,
  FEATURES,
  linearModel,
  scoreProbabilities,
  type Coefficients,
  type FeatureKey,
  type ModelContext,
  type PredictionModel,
  type RaceFeatures,
} from './probabilityModel';

/**
 * 予測モデルの学習と検証（条件付きロジット）
 *
 * 1. 確定レースを日付順に並べ、古い約80%を学習用、新しい約20%を検証用に分ける（時系列分割）。
 * 2. 学習用で係数を最尤推定する（L2正則化でコース別基準モデルに寄せる）。
 * 3. 検証用（学習に使っていない期間）で、学習モデル・デモモデル・基準モデルを同じ指標で比較する。
 * 特徴量の場・コース別1着率は、常に各レースの日付より前の過去データだけで計算する。
 */

export const MIN_TRAIN_RACES = 200;
export const MIN_VALIDATE_RACES = 100;
/** 「検証済み」とみなす検証レース数の下限 */
export const VALIDATED_MIN_RACES = 300;

interface Sample {
  rows: RaceFeatures['rows'];
  winnerIndex: number;
}

export function buildSamples(races: readonly Race[], ctx: ModelContext): { samples: Sample[]; skipped: number } {
  const samples: Sample[] = [];
  let skipped = 0;
  for (const race of races) {
    const winner = race.result?.finishOrder[0];
    if (race.status !== 'finished' || winner === undefined) continue;
    const f = extractFeatures(race, ctx);
    if (!f.ok || !f.value.rows[winner - 1]) {
      skipped++;
      continue;
    }
    samples.push({ rows: f.value.rows, winnerIndex: winner - 1 });
  }
  return { samples, skipped };
}

/** L2正則化の中心（＝コース別基準モデル）。データが少ない要素は基準モデルに近い値になる */
const PRIOR: Coefficients = {
  logCourse: 1,
  gradeA1: 0,
  gradeA2: 0,
  gradeB2: 0,
  nationalWinRate: 0,
  motorTwoRate: 0,
  exhibitionTime: 0,
};

export function negativeLogLikelihood(samples: readonly Sample[], coef: Coefficients): number {
  let nll = 0;
  for (const s of samples) nll -= Math.log(Math.max(scoreProbabilities(s.rows, coef)[s.winnerIndex] ?? 0, 1e-15));
  return samples.length ? nll / samples.length : 0;
}

/** 平均負の対数尤度 + L2 を Adam で最小化する */
export function fitConditionalLogit(
  samples: readonly Sample[],
  opts: { l2?: number; iterations?: number; learningRate?: number; init?: Coefficients } = {},
): Coefficients {
  const { l2 = 0.01, iterations = 400, learningRate = 0.05, init = PRIOR } = opts;
  const keys = FEATURES.map((f) => f.key);
  const w = keys.map((k) => init[k]);
  const m = keys.map(() => 0);
  const v = keys.map(() => 0);
  const toCoef = (): Coefficients => Object.fromEntries(keys.map((k, i) => [k, w[i]!])) as Coefficients;
  if (samples.length === 0) return toCoef();

  for (let t = 1; t <= iterations; t++) {
    const grad = keys.map((k, i) => l2 * (w[i]! - PRIOR[k]));
    const coef = toCoef();
    for (const s of samples) {
      const p = scoreProbabilities(s.rows, coef);
      s.rows.forEach((row, i) => {
        if (!row) return;
        const y = i === s.winnerIndex ? 1 : 0;
        keys.forEach((k, j) => (grad[j]! += ((p[i]! - y) * row[k]) / samples.length));
      });
    }
    keys.forEach((_, j) => {
      m[j] = 0.9 * m[j]! + 0.1 * grad[j]!;
      v[j] = 0.999 * v[j]! + 0.001 * grad[j]! ** 2;
      const mh = m[j]! / (1 - 0.9 ** t);
      const vh = v[j]! / (1 - 0.999 ** t);
      w[j] = w[j]! - (learningRate * mh) / (Math.sqrt(vh) + 1e-8);
    });
  }
  return toCoef();
}

/** 日付で学習用・検証用に分ける。同じ日のレースは同じ側に入れる */
export function splitByDate(races: readonly Race[], trainRatio = 0.8): { train: Race[]; validate: Race[]; splitDate: string | null } {
  const finished = races.filter((r) => r.status === 'finished' && r.result).sort((a, b) => a.date.localeCompare(b.date));
  const dates = [...new Set(finished.map((r) => r.date))];
  if (dates.length < 2) return { train: finished, validate: [], splitDate: null };
  const target = finished.length * trainRatio;
  let count = 0;
  let splitDate = dates[dates.length - 1]!;
  for (const d of dates) {
    count += finished.filter((r) => r.date === d).length;
    if (count >= target) {
      const idx = dates.indexOf(d);
      splitDate = dates[Math.min(idx + 1, dates.length - 1)]!;
      break;
    }
  }
  return {
    train: finished.filter((r) => r.date < splitDate),
    validate: finished.filter((r) => r.date >= splitDate),
    splitDate,
  };
}

const period = (rs: readonly Race[]) => (rs.length ? { from: rs[0]!.date, to: rs[rs.length - 1]!.date } : null);

export const trainingReportSchema = z.object({
  trainedAt: z.string(),
  dataSource: z.enum(['sample', 'actual']),
  isDemoData: z.boolean(),
  coefficients: z.object(Object.fromEntries(FEATURES.map((f) => [f.key, z.number().finite()])) as Record<FeatureKey, z.ZodNumber>),
  trainRaces: z.number().int(),
  validateRaces: z.number().int(),
  trainPeriod: z.object({ from: z.string(), to: z.string() }).nullable(),
  validatePeriod: z.object({ from: z.string(), to: z.string() }).nullable(),
  metrics: z.array(
    z.object({
      modelId: z.string(),
      name: z.string(),
      n: z.number().int(),
      logLoss: z.number().nullable(),
      brierScore: z.number().nullable(),
      top1HitRate: z.number().nullable(),
    }),
  ),
  improvedOverBaseline: z.boolean(),
  validated: z.boolean(),
});
export type TrainingReport = z.infer<typeof trainingReportSchema>;

export type TrainingResult =
  | { ok: true; report: TrainingReport }
  | { ok: false; reason: string; trainRaces: number; validateRaces: number };

export function trainModel(
  races: readonly Race[],
  ctx: ModelContext,
  info: { dataSource: 'sample' | 'actual'; isDemoData: boolean; trainedAt: string },
): TrainingResult {
  const { train, validate } = splitByDate(races);
  const trainSamples = buildSamples(train, ctx).samples;
  const validateCount = buildSamples(validate, ctx).samples.length;
  if (trainSamples.length < MIN_TRAIN_RACES || validateCount < MIN_VALIDATE_RACES) {
    return {
      ok: false,
      reason: `学習には確定レースが学習用${MIN_TRAIN_RACES}件・検証用${MIN_VALIDATE_RACES}件以上必要です（学習用${trainSamples.length}件・検証用${validateCount}件）`,
      trainRaces: trainSamples.length,
      validateRaces: validateCount,
    };
  }
  const coefficients = fitConditionalLogit(trainSamples);
  const trained = linearModel({ id: 'trained', name: '学習モデル', description: '', validated: false, coefficients });
  const evals: { model: PredictionModel; ev: ModelEvaluation }[] = [trained, demoCompositeModel, courseBaselineModel].map((model) => ({
    model,
    ev: evaluateModel(model, validate, ctx),
  }));
  const ll = (id: string) => evals.find((e) => e.model.id === id)?.ev.logLoss ?? Infinity;
  const improved = ll('trained') < ll(courseBaselineModel.id);
  return {
    ok: true,
    report: {
      ...info,
      coefficients,
      trainRaces: trainSamples.length,
      validateRaces: validateCount,
      trainPeriod: period(train),
      validatePeriod: period(validate),
      metrics: evals.map(({ model, ev }) => ({
        modelId: model.id,
        name: model.name,
        n: ev.n,
        logLoss: ev.logLoss,
        brierScore: ev.brierScore,
        top1HitRate: ev.top1HitRate,
      })),
      improvedOverBaseline: improved,
      // デモデータでの学習は、件数や結果にかかわらず「検証済み」にしない
      validated: !info.isDemoData && improved && validateCount >= VALIDATED_MIN_RACES,
    },
  };
}

export function trainedModelFromReport(report: TrainingReport): PredictionModel {
  const p = report.trainPeriod;
  return linearModel({
    id: 'trained',
    name: report.validated ? '学習モデル（検証済み）' : '学習モデル（未検証）',
    description: `${p ? `${p.from}〜${p.to}の` : ''}確定${report.trainRaces}レースで係数を推定し、それ以降の${report.validateRaces}レースで検証したモデルです。${
      report.isDemoData ? '架空のデモデータで学習しているため、実際の精度は示しません。' : ''
    }`,
    validated: report.validated,
    coefficients: report.coefficients,
  });
}
