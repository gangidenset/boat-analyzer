import type { BetType, HistoricalRace, Race } from '../domain/types';
import { err, ok, type Result } from '../domain/types';
import { allCombos, comboKey } from './combinations';
import { computeCourseStats, filterHistoricalRaces } from './venueStats';

/**
 * 推定確率モデル
 *
 * モデルは「各艇の1着確率」を返す。2連単・3連単の確率は Harville 法で1着確率から導く。
 * すべてのモデルは PredictionModel インターフェースに従うため、将来のモデル追加や
 * 過去データでの検証（evaluation.ts）を同じ手順で行える。
 *
 * 重要: 同梱モデルの係数は検証されていない仮の値であり、確率の精度は保証されない。
 */

export interface ModelContext {
  historicalRaces: readonly HistoricalRace[];
}

export interface WinProbabilityEstimate {
  /** index 0 = 1号艇。欠場艇は 0 */
  probabilities: number[];
  /** 推定に使えた要素 */
  usedFactors: string[];
  /** 欠損のため使わなかった要素（0埋めはしない） */
  missingFactors: string[];
  /** 根拠とした過去レース数 */
  sampleSize: number;
}

export type ModelErrorCode = 'insufficient_data' | 'no_entrants';

export interface ModelError {
  code: ModelErrorCode;
  message: string;
}

export interface PredictionModel {
  id: string;
  name: string;
  description: string;
  /** 過去データで精度を検証済みか（同梱モデルはすべて false） */
  validated: boolean;
  predictWin(race: Race, ctx: ModelContext): Result<WinProbabilityEstimate, ModelError>;
}

/** 合計が1になるよう正規化。合計が0以下なら null */
export function normalize(weights: readonly number[]): number[] | null {
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clean.reduce((s, w) => s + w, 0);
  if (total <= 0) return null;
  return clean.map((w) => w / total);
}

/** Harville 法: P(i→j→k) = p_i × p_j/(1−p_i) × p_k/(1−p_i−p_j) */
export function harvilleProbability(winProbs: readonly number[], combo: readonly number[]): number {
  let remaining = 1;
  let p = 1;
  for (const boat of combo) {
    const pi = winProbs[boat - 1] ?? 0;
    if (pi <= 0 || remaining <= 1e-12) return 0;
    p *= pi / remaining;
    remaining -= pi;
  }
  return p;
}

export function combinationProbabilities(winProbs: readonly number[], betType: BetType): Map<string, number> {
  const map = new Map<string, number>();
  for (const combo of allCombos(betType)) map.set(comboKey(combo), harvilleProbability(winProbs, combo));
  return map;
}

/** 進入コース：展示の進入があればそれを、なければ枠なり（艇番＝コース）とみなす */
export function expectedCourses(race: Race): { courses: number[]; fromExhibition: boolean } {
  const ex = race.exhibition?.entries;
  const fromEx = ex?.map((e) => e.startCourse);
  if (fromEx && fromEx.every((c): c is number => c !== null) && new Set(fromEx).size === 6) {
    return { courses: fromEx, fromExhibition: true };
  }
  return { courses: [1, 2, 3, 4, 5, 6], fromExhibition: false };
}

/** ベイズ平滑化の強さ（場の件数が少ないとき全場平均に寄せる） */
const SMOOTHING_STARTS = 30;
/** 全場平均のラプラス平滑化（1着0回のコースでも確率を厳密な0にしない） */
const LAPLACE_ALPHA = 1;
const MIN_HISTORICAL_RACES = 30;

/** 場・コース別の1着率（全場平均で平滑化）。データ不足なら error */
export function courseWinRates(
  venueId: string,
  historical: readonly HistoricalRace[],
): Result<{ rates: number[]; sampleSize: number }, ModelError> {
  const all = computeCourseStats(historical);
  if (all.sampleRaces < MIN_HISTORICAL_RACES) {
    return err({
      code: 'insufficient_data',
      message: `過去レースが${MIN_HISTORICAL_RACES}件未満のため推定できません（${all.sampleRaces}件）`,
    });
  }
  const venueStats = computeCourseStats(filterHistoricalRaces(historical, { venueId, windBand: 'all', waveBand: 'all' }));
  const rates = venueStats.courses.map((c, i) => {
    const a = all.courses[i];
    const prior = a ? (a.wins + LAPLACE_ALPHA) / (a.starts + 6 * LAPLACE_ALPHA) : 1 / 6;
    return (c.wins + SMOOTHING_STARTS * prior) / (c.starts + SMOOTHING_STARTS);
  });
  return ok({ rates, sampleSize: venueStats.sampleRaces });
}

function entrantMask(race: Race): boolean[] {
  return race.entries.map((e) => e.status === 'entered');
}

/** モデル1: 場・コース別1着率のみ */
export const courseBaselineModel: PredictionModel = {
  id: 'course-baseline',
  name: 'コース別基準モデル',
  description: '競艇場・進入コース別の過去1着率だけで推定します（選手・展示は考慮しません）。',
  validated: false,
  predictWin(race, ctx) {
    const base = courseWinRates(race.venueId, ctx.historicalRaces);
    if (!base.ok) return base;
    const { courses, fromExhibition } = expectedCourses(race);
    const mask = entrantMask(race);
    const probs = normalize(courses.map((c, i) => (mask[i] ? (base.value.rates[c - 1] ?? 0) : 0)));
    if (!probs) return err({ code: 'no_entrants', message: '出走艇がありません' });
    return ok({
      probabilities: probs,
      usedFactors: ['場・コース別1着率', fromExhibition ? '展示進入コース' : '枠なり想定'],
      missingFactors: fromExhibition ? [] : ['展示進入コース'],
      sampleSize: base.value.sampleSize,
    });
  },
};

/** デモ用係数（未検証の仮の値。将来は過去データで推定・検証して置き換える） */
export const DEMO_COEFFICIENTS = {
  grade: { A1: 0.35, A2: 0.15, B1: 0, B2: -0.3 } as Record<string, number>,
  nationalWinRatePerPoint: 0.15,
  nationalWinRateCenter: 5.0,
  motorTwoRatePerPoint: 0.01,
  motorTwoRateCenter: 35,
  /** 展示タイムが平均より 0.1 秒速いと +0.4（対数オッズ） */
  exhibitionTimePerSecond: -4,
} as const;

/** モデル2: コース別基準 × 選手・モーター・展示の補正（デモ係数） */
export const demoCompositeModel: PredictionModel = {
  id: 'demo-composite',
  name: '複合デモモデル',
  description:
    'コース別1着率に、級別・全国勝率・モーター2連率・展示タイムによる補正をかけます。係数は未検証のデモ値です。',
  validated: false,
  predictWin(race, ctx) {
    const base = courseBaselineModel.predictWin(race, ctx);
    if (!base.ok) return base;
    const used = new Set(base.value.usedFactors);
    const missing = new Set(base.value.missingFactors);
    const c = DEMO_COEFFICIENTS;

    const exTimes = race.exhibition?.entries.map((e) => e.exhibitionTime) ?? [];
    const available = exTimes.filter((t, i): t is number => t !== null && race.entries[i]?.status === 'entered');
    const exMean = available.length >= 2 ? available.reduce((s, t) => s + t, 0) / available.length : null;
    if (!race.exhibition) missing.add('展示情報（未発表）');

    const weights = race.entries.map((entry, i) => {
      const p = base.value.probabilities[i] ?? 0;
      if (entry.status !== 'entered' || p <= 0) return 0;
      let logit = c.grade[entry.racer.grade] ?? 0;
      used.add('級別');
      if (entry.racer.nationalWinRate !== null) {
        logit += (entry.racer.nationalWinRate - c.nationalWinRateCenter) * c.nationalWinRatePerPoint;
        used.add('全国勝率');
      } else missing.add(`全国勝率（${i + 1}号艇）`);
      if (entry.motor.twoRate !== null) {
        logit += (entry.motor.twoRate - c.motorTwoRateCenter) * c.motorTwoRatePerPoint;
        used.add('モーター2連率');
      } else missing.add(`モーター2連率（${i + 1}号艇）`);
      const t = exTimes[i];
      if (exMean !== null && t !== null && t !== undefined) {
        logit += (t - exMean) * c.exhibitionTimePerSecond;
        used.add('展示タイム');
      } else if (race.exhibition) missing.add(`展示タイム（${i + 1}号艇）`);
      return p * Math.exp(logit);
    });
    const probs = normalize(weights);
    if (!probs) return err({ code: 'no_entrants', message: '出走艇がありません' });
    return ok({
      probabilities: probs,
      usedFactors: [...used],
      missingFactors: [...missing],
      sampleSize: base.value.sampleSize,
    });
  },
};

export const MODELS: readonly PredictionModel[] = [demoCompositeModel, courseBaselineModel];

export function getModel(id: string): PredictionModel {
  return MODELS.find((m) => m.id === id) ?? demoCompositeModel;
}
