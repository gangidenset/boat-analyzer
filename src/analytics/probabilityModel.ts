import type { BetType, HistoricalRace, Race } from '../domain/types';
import { err, ok, type Result } from '../domain/types';
import { allCombos, comboKey } from './combinations';
import { CourseRateIndex } from './courseRates';

/**
 * 推定確率モデル
 *
 * モデルは「各艇の1着確率」を返す。2連単・3連単の確率は Harville 法で1着確率から導く。
 * 同梱モデルはすべて「特徴量 × 係数」の条件付きロジット（多項ロジット）で表す。
 *   スコア_i = Σ 係数_k × 特徴量_ik、 P(i が1着) = exp(スコア_i) ÷ Σ_j exp(スコア_j)
 * 係数を固定したものがデモモデル、過去データから推定したものが学習モデル（training.ts）。
 */

export interface ModelContext {
  /** 場・コース別の累計（予測対象レースの日付より前だけを使う） */
  courseIndex: CourseRateIndex;
}

export function createModelContext(historical: readonly HistoricalRace[]): ModelContext {
  return { courseIndex: new CourseRateIndex(historical) };
}

export interface WinProbabilityEstimate {
  /** index 0 = 1号艇。欠場艇は 0 */
  probabilities: number[];
  /** 推定に使えた要素 */
  usedFactors: string[];
  /** 欠損のため使わなかった要素（0埋めはしない） */
  missingFactors: string[];
  /** 根拠とした過去レース数（対象レースの日付より前） */
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
  /** 過去データで精度を検証済みか */
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
export const MIN_HISTORICAL_RACES = 30;

/** before（YYYY-MM-DD）より前の過去レースによる、場・コース別の1着率（全場平均で平滑化）。不足なら error */
export function courseWinRates(
  index: CourseRateIndex,
  venueId: string,
  before: string,
): Result<{ rates: number[]; sampleSize: number }, ModelError> {
  const all = index.allBefore(before);
  if (all.races < MIN_HISTORICAL_RACES) {
    return err({
      code: 'insufficient_data',
      message: `対象日より前の過去レースが${MIN_HISTORICAL_RACES}件未満のため推定できません（${all.races}件）`,
    });
  }
  const venue = index.venueBefore(venueId, before);
  const rates = venue.wins.map((w, i) => {
    const prior = (all.wins[i]! + LAPLACE_ALPHA) / (all.starts[i]! + 6 * LAPLACE_ALPHA);
    return (w + SMOOTHING_STARTS * prior) / (venue.starts[i]! + SMOOTHING_STARTS);
  });
  return ok({ rates, sampleSize: venue.races });
}

// ---- 特徴量 ----

export const FEATURES = [
  { key: 'logCourse', label: '場・コース別1着率（対数）' },
  { key: 'gradeA1', label: '級別A1' },
  { key: 'gradeA2', label: '級別A2' },
  { key: 'gradeB2', label: '級別B2' },
  { key: 'nationalWinRate', label: '全国勝率（5.0との差）' },
  { key: 'motorTwoRate', label: 'モーター2連率（35%との差、10%単位）' },
  { key: 'exhibitionTime', label: '展示タイム（平均との差、0.1秒単位）' },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];
export type Coefficients = Record<FeatureKey, number>;

export interface RaceFeatures {
  /** index 0 = 1号艇。欠場艇は null */
  rows: (Record<FeatureKey, number> | null)[];
  missing: string[];
  fromExhibitionCourse: boolean;
  sampleSize: number;
}

/**
 * レースの特徴量。欠損値は「平均と同じ（差0）」として扱い、欠損として報告する。
 * 確率を作るために値を捏造しないよう、欠損の一覧を必ず画面に出す。
 */
export function extractFeatures(race: Race, ctx: ModelContext): Result<RaceFeatures, ModelError> {
  const base = courseWinRates(ctx.courseIndex, race.venueId, race.date);
  if (!base.ok) return base;
  const { courses, fromExhibition } = expectedCourses(race);
  const missing: string[] = [];
  if (!fromExhibition) missing.push('展示進入コース（枠なりと仮定）');
  if (!race.exhibition) missing.push('展示情報（未発表）');

  const exTimes = race.exhibition?.entries.map((e) => e.exhibitionTime) ?? [];
  const available = exTimes.filter((t, i): t is number => t !== null && race.entries[i]?.status === 'entered');
  const exMean = available.length >= 2 ? available.reduce((s, t) => s + t, 0) / available.length : null;

  const rows = race.entries.map((e, i) => {
    if (e.status !== 'entered') return null;
    const boat = i + 1;
    const nat = e.racer.nationalWinRate;
    if (nat === null) missing.push(`全国勝率（${boat}号艇）`);
    const motor = e.motor.twoRate;
    if (motor === null) missing.push(`モーター2連率（${boat}号艇）`);
    const t = exTimes[i];
    const hasEx = exMean !== null && t !== null && t !== undefined;
    if (race.exhibition && !hasEx) missing.push(`展示タイム（${boat}号艇）`);
    return {
      logCourse: Math.log(base.value.rates[(courses[i] ?? boat) - 1] ?? 1 / 6),
      gradeA1: e.racer.grade === 'A1' ? 1 : 0,
      gradeA2: e.racer.grade === 'A2' ? 1 : 0,
      gradeB2: e.racer.grade === 'B2' ? 1 : 0,
      nationalWinRate: nat === null ? 0 : nat - 5.0,
      motorTwoRate: motor === null ? 0 : (motor - 35) / 10,
      exhibitionTime: hasEx ? (t - exMean) / 0.1 : 0,
    };
  });
  if (rows.every((r) => r === null)) return err({ code: 'no_entrants', message: '出走艇がありません' });
  return ok({ rows, missing, fromExhibitionCourse: fromExhibition, sampleSize: base.value.sampleSize });
}

/** 係数と特徴量から1着確率（softmax）。欠場艇は0 */
export function scoreProbabilities(rows: RaceFeatures['rows'], coef: Coefficients): number[] {
  const scores = rows.map((r) => (r ? FEATURES.reduce((s, f) => s + coef[f.key] * r[f.key], 0) : null));
  const max = Math.max(...scores.filter((s): s is number => s !== null));
  const exps = scores.map((s) => (s === null ? 0 : Math.exp(s - max)));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

const FACTOR_OF: Partial<Record<FeatureKey, string>> = {
  logCourse: '場・コース別1着率',
  gradeA1: '級別',
  gradeA2: '級別',
  gradeB2: '級別',
  nationalWinRate: '全国勝率',
  motorTwoRate: 'モーター2連率',
  exhibitionTime: '展示タイム',
};

/** 係数が0の要素は「使用要素」にも「欠損」にも出さない */
function relevantMissing(missing: readonly string[], coef: Coefficients): string[] {
  const active = new Set(FEATURES.filter((f) => coef[f.key] !== 0).map((f) => FACTOR_OF[f.key]));
  return missing.filter((m) => {
    if (m.startsWith('展示進入コース')) return coef.logCourse !== 0;
    if (m.startsWith('展示情報')) return coef.exhibitionTime !== 0;
    return [...active].some((a) => a && m.startsWith(a));
  });
}

export function linearModel(def: Omit<PredictionModel, 'predictWin'> & { coefficients: Coefficients }): PredictionModel {
  const coef = def.coefficients;
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    validated: def.validated,
    predictWin(race, ctx) {
      const f = extractFeatures(race, ctx);
      if (!f.ok) return f;
      const used = [...new Set(FEATURES.filter((x) => coef[x.key] !== 0).map((x) => FACTOR_OF[x.key]!))];
      if (coef.logCourse !== 0 && f.value.fromExhibitionCourse) used.push('展示進入コース');
      return ok({
        probabilities: scoreProbabilities(f.value.rows, coef),
        usedFactors: used,
        missingFactors: relevantMissing(f.value.missing, coef),
        sampleSize: f.value.sampleSize,
      });
    },
  };
}

const ZERO: Coefficients = {
  logCourse: 0,
  gradeA1: 0,
  gradeA2: 0,
  gradeB2: 0,
  nationalWinRate: 0,
  motorTwoRate: 0,
  exhibitionTime: 0,
};

/** モデル1: 場・コース別1着率のみ */
export const courseBaselineModel = linearModel({
  id: 'course-baseline',
  name: 'コース別基準モデル',
  description: '競艇場・進入コース別の過去1着率だけで推定します（選手・展示は考慮しません）。',
  validated: false,
  coefficients: { ...ZERO, logCourse: 1 },
});

/** デモ用係数（未検証の仮の値）。学習モデルの初期値にも使う */
export const DEMO_COEFFICIENTS: Coefficients = {
  logCourse: 1,
  gradeA1: 0.35,
  gradeA2: 0.15,
  gradeB2: -0.3,
  nationalWinRate: 0.15,
  motorTwoRate: 0.1,
  exhibitionTime: -0.4,
};

/** モデル2: コース別基準 × 選手・モーター・展示の補正（デモ係数） */
export const demoCompositeModel = linearModel({
  id: 'demo-composite',
  name: '複合デモモデル',
  description:
    'コース別1着率に、級別・全国勝率・モーター2連率・展示タイムによる補正をかけます。係数は未検証のデモ値です。',
  validated: false,
  coefficients: DEMO_COEFFICIENTS,
});

export const BUILTIN_MODELS: readonly PredictionModel[] = [demoCompositeModel, courseBaselineModel];

export function findModel(models: readonly PredictionModel[], id: string): PredictionModel {
  return models.find((m) => m.id === id) ?? models[0] ?? demoCompositeModel;
}
