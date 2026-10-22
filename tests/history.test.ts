import { describe, expect, it } from 'vitest';
import { settleRecord, summarizeHistory } from '../src/analytics/history';
import type { AnalysisRecord } from '../src/domain/types';
import { makeRace } from './fixtures';

const rec = (o: Partial<AnalysisRecord>): AnalysisRecord => ({
  id: Math.random().toString(),
  createdAt: '2026-10-21T10:00:00+09:00',
  source: 'sample',
  raceId: 'F1',
  raceLabel: 'テスト',
  modelId: 'demo-composite',
  betType: 'trifecta',
  combination: '1-2-3',
  odds: 12.3,
  probability: 0.1,
  expectedReturnRate: 0.23,
  stake: 100,
  oddsFetchedAt: null,
  ...o,
});

const finished = makeRace({
  id: 'F1',
  status: 'finished',
  result: {
    finishOrder: [1, 2, 3, 4, 5, 6],
    kimarite: '逃げ',
    payouts: {
      win: { combination: '1', payout: 150 },
      exacta: { combination: '1-2', payout: 420 },
      trifecta: { combination: '1-2-3', payout: 1230 },
    },
  },
});

describe('分析記録の照合', () => {
  it('的中：払戻は購入額に比例', () => {
    const s = settleRecord(rec({ stake: 200 }), finished);
    expect(s.status).toBe('hit');
    expect(s.payout).toBe(2460);
  });
  it('不的中は払戻0', () => {
    expect(settleRecord(rec({ combination: '1-3-2' }), finished)).toMatchObject({ status: 'miss', payout: 0 });
  });
  it('未確定は結果待ち、レースが無い場合は不明', () => {
    expect(settleRecord(rec({}), makeRace({ id: 'F1' })).status).toBe('pending');
    expect(settleRecord(rec({}), undefined).status).toBe('unknown');
    expect(settleRecord(rec({}), makeRace({ status: 'cancelled' })).status).toBe('cancelled');
  });
  it('的中だが払戻データがない場合は payout=null', () => {
    const noPayout = { ...finished, result: { ...finished.result!, payouts: { win: null, exacta: null, trifecta: null } } };
    expect(settleRecord(rec({}), noPayout)).toMatchObject({ status: 'hit', payout: null });
  });
});

describe('的中率・回収率の集計', () => {
  const items = [
    settleRecord(rec({}), finished), // hit 1230
    settleRecord(rec({ combination: '2-1-3' }), finished), // miss
    settleRecord(rec({ betType: 'win', combination: '1' }), finished), // hit 150
    settleRecord(rec({ raceId: 'X' }), makeRace({ id: 'X' })), // pending
    settleRecord(rec({ source: 'actual', combination: '6-5-4' }), finished), // actual miss
  ];

  it('サンプルと実績を分けて集計', () => {
    const s = summarizeHistory(items, 'sample');
    expect(s).toMatchObject({ total: 4, settled: 3, pending: 1, hits: 2, stake: 300, returned: 1380, profit: 1080 });
    expect(s.hitRate).toBeCloseTo(2 / 3, 10);
    expect(s.recoveryRate).toBeCloseTo(13.8 / 3, 10);
    const a = summarizeHistory(items, 'actual');
    expect(a).toMatchObject({ total: 1, settled: 1, hits: 0, hitRate: 0, recoveryRate: 0 });
  });

  it('確定0件なら的中率・回収率は null（0%と表示しない）', () => {
    const s = summarizeHistory([], 'actual');
    expect(s.hitRate).toBeNull();
    expect(s.recoveryRate).toBeNull();
  });
});
