import type { AnalysisRecord, DataSourceKind, Race } from '../domain/types';
import { isHit } from './combinations';

/** 分析記録と結果の照合 */
export type SettlementStatus = 'hit' | 'miss' | 'pending' | 'cancelled' | 'unknown';

export interface SettledRecord {
  record: AnalysisRecord;
  status: SettlementStatus;
  /** 払戻額（円）。的中で払戻データがない場合は null */
  payout: number | null;
  finishOrder: number[] | null;
}

export function settleRecord(record: AnalysisRecord, race: Race | undefined): SettledRecord {
  if (!race) return { record, status: 'unknown', payout: null, finishOrder: null };
  if (race.status === 'cancelled') return { record, status: 'cancelled', payout: null, finishOrder: null };
  if (race.status !== 'finished' || !race.result) return { record, status: 'pending', payout: null, finishOrder: null };
  const { finishOrder, payouts } = race.result;
  if (!isHit(record.betType, record.combination, finishOrder)) {
    return { record, status: 'miss', payout: 0, finishOrder };
  }
  const p = payouts[record.betType];
  const payout = p && p.combination === record.combination ? Math.round((p.payout * record.stake) / 100) : null;
  return { record, status: 'hit', payout, finishOrder };
}

export interface HistorySummary {
  source: DataSourceKind;
  total: number;
  /** 的中/不的中が確定した件数（払戻不明の的中は除外） */
  settled: number;
  pending: number;
  hits: number;
  /** settled = 0 のときは null */
  hitRate: number | null;
  stake: number;
  returned: number;
  /** 回収率 = 払戻合計 ÷ 購入合計。settled = 0 のときは null */
  recoveryRate: number | null;
  profit: number;
}

export function summarizeHistory(items: readonly SettledRecord[], source: DataSourceKind): HistorySummary {
  const mine = items.filter((i) => i.record.source === source);
  const settled = mine.filter((i) => i.status === 'miss' || (i.status === 'hit' && i.payout !== null));
  const hits = settled.filter((i) => i.status === 'hit').length;
  const stake = settled.reduce((s, i) => s + i.record.stake, 0);
  const returned = settled.reduce((s, i) => s + (i.payout ?? 0), 0);
  return {
    source,
    total: mine.length,
    settled: settled.length,
    pending: mine.filter((i) => i.status === 'pending').length,
    hits,
    hitRate: settled.length ? hits / settled.length : null,
    stake,
    returned,
    recoveryRate: stake > 0 ? returned / stake : null,
    profit: returned - stake,
  };
}
