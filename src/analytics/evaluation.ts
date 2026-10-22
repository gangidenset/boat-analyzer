import type { Race } from '../domain/types';
import type { ModelContext, PredictionModel } from './probabilityModel';

/**
 * モデル検証：結果が確定したレースで 1着確率の当てはまりを測る。
 * 将来、実データの過去成績を投入すれば同じ関数でモデル比較ができる。
 */
export interface ModelEvaluation {
  modelId: string;
  /** 評価できたレース数 */
  n: number;
  /** 多クラス Brier スコア（小さいほど良い。全艇1/6の一様予測で約0.83） */
  brierScore: number | null;
  /** 対数損失（小さいほど良い。一様予測で ln6 ≈ 1.79） */
  logLoss: number | null;
  /** 最大確率の艇が1着だった割合 */
  top1HitRate: number | null;
  skipped: number;
}

export function evaluateModel(model: PredictionModel, races: readonly Race[], ctx: ModelContext): ModelEvaluation {
  let n = 0;
  let brier = 0;
  let logLoss = 0;
  let hits = 0;
  let skipped = 0;
  for (const race of races) {
    const winner = race.result?.finishOrder[0];
    if (race.status !== 'finished' || winner === undefined) continue;
    const est = model.predictWin(race, ctx);
    if (!est.ok) {
      skipped++;
      continue;
    }
    const p = est.value.probabilities;
    n++;
    brier += p.reduce((s, pi, i) => s + (pi - (i + 1 === winner ? 1 : 0)) ** 2, 0);
    logLoss += -Math.log(Math.max(p[winner - 1] ?? 0, 1e-15));
    const top = p.indexOf(Math.max(...p)) + 1;
    if (top === winner) hits++;
  }
  return {
    modelId: model.id,
    n,
    brierScore: n ? brier / n : null,
    logLoss: n ? logLoss / n : null,
    top1HitRate: n ? hits / n : null,
    skipped,
  };
}
