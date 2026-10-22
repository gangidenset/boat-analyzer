import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { evaluateModel } from '../analytics/evaluation';
import { settleRecord, summarizeHistory, type HistorySummary, type SettlementStatus } from '../analytics/history';
import { FEATURES } from '../analytics/probabilityModel';
import { MIN_TRAIN_RACES, MIN_VALIDATE_RACES, VALIDATED_MIN_RACES } from '../analytics/training';
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
  const { records, removeRecord, clearRecords, settings, models, modelContext } = useAppState();
  const settled = useMemo(() => {
    const byId = new Map(dataset.races.map((r) => [r.id, r]));
    return records.map((r) => settleRecord(r, byId.get(r.raceId)));
  }, [records, dataset]);
  const evaluations = useMemo(
    () => (modelContext ? models.map((m) => ({ model: m, ev: evaluateModel(m, dataset.races, modelContext) })) : []),
    [dataset, models, modelContext],
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
                    <div className="muted small">{models.find((m) => m.id === r.modelId)?.name ?? r.modelId}</div>
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

      <TrainingPanel />

      <h2>モデル検証（確定レースでの当てはまり）</h2>
      <p className="muted small">
        確定済みレース全体で各モデルの1着確率を評価します（各レースの日付より前のデータだけで予測）。学習モデルはこの中に学習に使ったレースを含むため、公平な比較は上の「検証期間」の表を見てください。{dataset.meta.isDemo && <><DemoBadge /> サンプルデータでの結果は実際の予測精度を示しません。</>}
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

function TrainingPanel() {
  const { runTraining, clearTraining, trainingReport: report, updateSettings, settings } = useAppState();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);

  const onTrain = () => {
    setRunning(true);
    // 画面に「学習中」を出してから計算する
    setTimeout(() => {
      const r = runTraining();
      setRunning(false);
      if (!r) setMessage({ ok: false, text: 'データが読み込まれていません' });
      else if (!r.ok) setMessage({ ok: false, text: r.reason });
      else setMessage({ ok: true, text: `学習しました（学習用${r.report.trainRaces}レース・検証用${r.report.validateRaces}レース）` });
    }, 30);
  };

  return (
    <section className="panel" aria-labelledby="training-title">
      <h2 id="training-title">モデルの学習と検証</h2>
      <p className="muted small">
        確定レースを日付順に分け、古い約80%で係数を推定（条件付きロジット）し、残りの新しい期間で精度を比べます。学習用{MIN_TRAIN_RACES}
        件・検証用{MIN_VALIDATE_RACES}件以上が必要です。実データで検証用{VALIDATED_MIN_RACES}件以上、かつ基準モデルより良い場合だけ「検証済み」になります。
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={onTrain} disabled={running}>
          {running ? '学習中…' : report ? '学習し直す' : '学習を実行'}
        </button>
        {report && settings.modelId !== 'trained' && (
          <button type="button" className="btn btn--ghost" onClick={() => updateSettings({ modelId: 'trained' })}>
            学習モデルを使う
          </button>
        )}
        {report && (
          <button type="button" className="btn btn--ghost" onClick={clearTraining}>
            学習結果を削除
          </button>
        )}
      </div>
      {message && (
        <p className={message.ok ? 'ok-msg' : 'warn'} role="status">
          {message.text}
        </p>
      )}
      {report && (
        <>
          <p className="small">
            {report.validated ? (
              <span className="pos">✓ 検証済み</span>
            ) : (
              <span className="warn">⚠ 未検証</span>
            )}{' '}
            学習期間 {report.trainPeriod ? `${report.trainPeriod.from}〜${report.trainPeriod.to}` : '—'}（{report.trainRaces}レース）／ 検証期間{' '}
            {report.validatePeriod ? `${report.validatePeriod.from}〜${report.validatePeriod.to}` : '—'}（{report.validateRaces}レース）
            {report.isDemoData && (
              <>
                {' '}
                <DemoBadge /> デモデータでの学習のため、実際の精度は示しません。
              </>
            )}
          </p>
          <div className="table-wrap">
            <table className="table" data-testid="validation-table">
              <caption className="sr-only">検証期間での比較</caption>
              <thead>
                <tr>
                  <th scope="col">モデル（検証期間）</th>
                  <th scope="col" className="num">レース数</th>
                  <th scope="col" className="num">対数損失</th>
                  <th scope="col" className="num">Brier</th>
                  <th scope="col" className="num">本命1着率</th>
                </tr>
              </thead>
              <tbody>
                {report.metrics.map((m) => (
                  <tr key={m.modelId}>
                    <td>{m.name}</td>
                    <td className="num">{m.n}</td>
                    <td className="num">{formatNumber(m.logLoss, 3)}</td>
                    <td className="num">{formatNumber(m.brierScore, 3)}</td>
                    <td className="num">{formatPercent(m.top1HitRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small">
            {report.improvedOverBaseline
              ? '検証期間で、学習モデルの対数損失は基準モデルより小さくなりました（小さいほど良い）。'
              : '検証期間で、学習モデルは基準モデルを上回れませんでした。データを増やして学習し直してください。'}
          </p>
          <details>
            <summary className="small">推定された係数</summary>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {FEATURES.map((f) => (
                    <tr key={f.key}>
                      <th scope="row">{f.label}</th>
                      <td className="num">{report.coefficients[f.key].toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
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
