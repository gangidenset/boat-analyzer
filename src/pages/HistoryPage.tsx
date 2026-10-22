import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { evaluateModel } from '../analytics/evaluation';
import { settleRecord, summarizeHistory, type HistorySummary, type SettlementStatus } from '../analytics/history';
import { MODELS, getModel } from '../analytics/probabilityModel';
import { DemoBadge, SignedRate } from '../components/Badges';
import { DataGate } from '../components/DataGate';
import { EmptyState } from '../components/StateViews';
import { BET_TYPE_LABEL, type Dataset, type DataSourceKind } from '../domain/types';
import { useAppState } from '../state/AppState';
import { formatDateTime, formatNumber, formatOdds, formatPercent, formatSignedPercent, formatYen } from '../utils/format';

export const STATUS_LABEL: Record<SettlementStatus, string> = {
  hit: '的中',
  miss: '不的中',
  pending: '結果待ち',
  cancelled: '中止',
  unknown: 'レース不明',
};
const STATUS_MARK: Record<SettlementStatus, string> = { hit: '◎', miss: '×', pending: '…', cancelled: '－', unknown: '?' };
const SOURCE_LABEL: Record<DataSourceKind, string> = { sample: 'サンプル（デモ）', actual: '実績（実データ）' };

function SummaryCard({ s }: { s: HistorySummary }) {
  return (
    <div className="panel" data-testid={`summary-${s.source}`}>
      <h3>
        {SOURCE_LABEL[s.source]} {s.source === 'sample' && <DemoBadge />}
      </h3>
      <dl className="kv">
        <dt>記録数</dt>
        <dd>{s.total}件（確定 {s.settled}／結果待ち {s.pending}）</dd>
        <dt>的中率</dt>
        <dd>{formatPercent(s.hitRate)}（{s.hits}/{s.settled}）</dd>
        <dt>回収率</dt>
        <dd>{formatPercent(s.recoveryRate)}</dd>
        <dt>購入／払戻</dt>
        <dd>
          {formatYen(s.stake)} ／ {formatYen(s.returned)}
        </dd>
        <dt>収支</dt>
        <dd>
          <SignedRate value={s.settled ? s.profit : null} text={s.settled ? formatYen(s.profit) : 'データなし'} />
        </dd>
      </dl>
    </div>
  );
}

function HistoryView({ dataset }: { dataset: Dataset }) {
  const { records, removeRecord, clearRecords, settings } = useAppState();
  const settled = useMemo(() => {
    const byId = new Map(dataset.races.map((r) => [r.id, r]));
    return records.map((r) => settleRecord(r, byId.get(r.raceId)));
  }, [records, dataset]);
  const evaluations = useMemo(
    () => MODELS.map((m) => ({ model: m, ev: evaluateModel(m, dataset.races, { historicalRaces: dataset.historicalRaces }) })),
    [dataset],
  );
  const currentSettled = settled.filter((s) => s.record.source === settings.dataMode);
  const otherCount = settled.length - currentSettled.length;

  return (
    <>
      <h2>予測と結果の集計</h2>
      <p className="muted small">サンプル（デモデータ）と実データの記録は混ぜずに別々に集計します。購入額は1記録 {settings.stake}円として計算します。</p>
      <div className="grid-2">
        <SummaryCard s={summarizeHistory(settled, 'sample')} />
        <SummaryCard s={summarizeHistory(settled, 'actual')} />
      </div>

      <h2>記録一覧（{settings.dataMode === 'sample' ? 'サンプル' : '実データ'}）</h2>
      {otherCount > 0 && <p className="muted small">別モードの記録 {otherCount} 件は、そのモードのデータで照合されます。</p>}
      {currentSettled.length === 0 ? (
        <EmptyState title="分析記録はまだありません">
          <Link to="/odds">オッズ・期待値分析</Link> の「保存」ボタンで買い目を記録すると、結果確定後に的中・回収率を集計します。
          確定済みのレース（例：10/21）を選ぶとすぐに照合を確認できます。
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">保存日時</th>
                <th scope="col">レース</th>
                <th scope="col">券種・買い目</th>
                <th scope="col" className="num">オッズ</th>
                <th scope="col" className="num">推定確率</th>
                <th scope="col" className="num">期待収益率</th>
                <th scope="col">結果</th>
                <th scope="col" className="num">払戻</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {currentSettled.map(({ record: r, status, payout, finishOrder }) => (
                <tr key={r.id}>
                  <td className="small">{formatDateTime(r.createdAt)}</td>
                  <td>
                    <Link to={`/races/${r.raceId}`}>{r.raceLabel}</Link>
                    <div className="muted small">{getModel(r.modelId).name}</div>
                  </td>
                  <td>
                    {BET_TYPE_LABEL[r.betType]} <span className="combo">{r.combination}</span>
                  </td>
                  <td className="num">{formatOdds(r.odds)}</td>
                  <td className="num">{formatPercent(r.probability, 2)}</td>
                  <td className="num">
                    <SignedRate value={r.expectedReturnRate} text={formatSignedPercent(r.expectedReturnRate)} />
                  </td>
                  <td>
                    <span className={`settle settle--${status}`}>
                      {STATUS_MARK[status]} {STATUS_LABEL[status]}
                    </span>
                    {finishOrder && <div className="muted small">結果 {finishOrder.slice(0, 3).join('-')}</div>}
                  </td>
                  <td className="num">{status === 'hit' || status === 'miss' ? formatYen(payout, '払戻データなし') : '—'}</td>
                  <td>
                    <button type="button" className="btn btn--small btn--ghost" onClick={() => removeRecord(r.id)} aria-label={`${r.raceLabel} ${r.combination} の記録を削除`}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {currentSettled.length > 0 && (
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            if (window.confirm('このモードの分析記録をすべて削除します。よろしいですか？')) clearRecords(settings.dataMode);
          }}
        >
          このモードの記録をすべて削除
        </button>
      )}

      <h2>モデル検証（確定レースでの当てはまり）</h2>
      <p className="muted small">
        確定済みレースで各モデルの1着確率を評価します。{dataset.meta.isDemo && <><DemoBadge /> サンプルデータでの結果は実際の予測精度を示しません。</>}
        Brierスコア・対数損失は小さいほど良く、全艇同確率の予測ではそれぞれ約0.83・約1.79です。
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">モデル</th>
              <th scope="col" className="num">評価レース数</th>
              <th scope="col" className="num">Brierスコア</th>
              <th scope="col" className="num">対数損失</th>
              <th scope="col" className="num">本命1着率</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map(({ model, ev }) => (
              <tr key={model.id}>
                <td>{model.name}</td>
                <td className="num">{ev.n}</td>
                <td className="num">{formatNumber(ev.brierScore, 3)}</td>
                <td className="num">{formatNumber(ev.logLoss, 3)}</td>
                <td className="num">{formatPercent(ev.top1HitRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function HistoryPage() {
  return (
    <section>
      <h1>分析履歴・振り返り</h1>
      <DataGate>{(dataset) => <HistoryView dataset={dataset} />}</DataGate>
    </section>
  );
}
