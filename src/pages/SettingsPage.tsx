import { useState } from 'react';
import { MODELS } from '../analytics/probabilityModel';
import { DemoBadge } from '../components/Badges';
import { ErrorState, LoadingState } from '../components/StateViews';
import type { DataSourceKind } from '../domain/types';
import { useAppState } from '../state/AppState';
import { formatDateTime, formatPercent } from '../utils/format';

const UPDATE_LABELS = {
  races: '出走表',
  exhibition: '展示情報',
  odds: 'オッズ',
  results: 'レース結果',
  historical: '過去成績（場別統計）',
} as const;

export function DataStatusTable() {
  const { data } = useAppState();
  if (data.status === 'loading') return <LoadingState />;
  if (data.status === 'error') return <p className="warn">データ未取得のため更新状況はありません（{data.error.message}）</p>;
  const { meta } = data.dataset;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">データ</th>
            <th scope="col">最終更新</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(UPDATE_LABELS) as (keyof typeof UPDATE_LABELS)[]).map((k) => (
            <tr key={k}>
              <td>{UPDATE_LABELS[k]}</td>
              <td>{formatDateTime(meta.updatedAt[k], '未取得')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, data, reload, loadLog, clearRecords, records } = useAppState();
  const [evText, setEvText] = useState(String(Math.round(settings.minExpectedReturnRate * 1000) / 10));
  const [probText, setProbText] = useState(String(Math.round(settings.minProbability * 1000) / 10));
  const [errors, setErrors] = useState<string[]>([]);
  const [savedMsg, setSavedMsg] = useState('');

  const saveThresholds = () => {
    const ev = Number(evText);
    const prob = Number(probText);
    const e: string[] = [];
    if (evText.trim() === '' || !Number.isFinite(ev) || ev < -100 || ev > 10000) e.push('期待収益率の下限は -100〜10000(%) の数値で入力してください');
    if (probText.trim() === '' || !Number.isFinite(prob) || prob < 0 || prob > 100) e.push('推定確率の下限は 0〜100(%) の数値で入力してください');
    setErrors(e);
    if (e.length === 0) {
      updateSettings({ minExpectedReturnRate: ev / 100, minProbability: prob / 100 });
      setSavedMsg('候補条件を保存しました');
    } else setSavedMsg('');
  };

  return (
    <section>
      <h1>設定・データ管理</h1>

      <div className="panel">
        <h2>データモード</h2>
        <fieldset className="checks">
          <legend className="sr-only">データモード</legend>
          {(['sample', 'actual'] as DataSourceKind[]).map((k) => (
            <label key={k} className="check">
              <input type="radio" name="dataMode" checked={settings.dataMode === k} onChange={() => updateSettings({ dataMode: k })} />
              {k === 'sample' ? 'サンプルデータ（デモ）' : '実データ'}
            </label>
          ))}
        </fieldset>
        <p className="muted small">実データモードは取得元が未設定のため、現在はエラー表示になります（外部通信は行いません）。</p>
        <button type="button" className="btn" onClick={reload}>
          データを再読み込み
        </button>
      </div>

      <div className="panel">
        <h2>データ取得元</h2>
        {data.status === 'loading' && <LoadingState />}
        {data.status === 'error' && <ErrorState error={data.error} onRetry={reload} />}
        {data.status === 'ready' && (
          <dl className="kv">
            <dt>提供元</dt>
            <dd>
              {data.dataset.meta.provider} {data.dataset.meta.isDemo && <DemoBadge />}
            </dd>
            <dt>説明</dt>
            <dd>{data.dataset.meta.description}</dd>
            <dt>生成日時</dt>
            <dd>{formatDateTime(data.dataset.meta.generatedAt)}</dd>
            <dt>件数</dt>
            <dd>
              開催レース {data.dataset.races.length}件 ／ 過去レース {data.dataset.historicalRaces.length}件 ／ 競艇場 {data.dataset.venues.length}場
            </dd>
          </dl>
        )}
        <h3>更新状況</h3>
        <DataStatusTable />
      </div>

      <div className="panel">
        <h2>分析設定</h2>
        <div className="filters">
          <label className="field">
            <span>推定モデル</span>
            <select value={settings.modelId} onChange={(e) => updateSettings({ modelId: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>候補：期待収益率の下限（%）</span>
            <input inputMode="decimal" value={evText} onChange={(e) => setEvText(e.target.value)} />
          </label>
          <label className="field">
            <span>候補：推定確率の下限（%）</span>
            <input inputMode="decimal" value={probText} onChange={(e) => setProbText(e.target.value)} />
          </label>
          <label className="field">
            <span>1記録の購入額</span>
            <select value={settings.stake} onChange={(e) => updateSettings({ stake: Number(e.target.value) })}>
              {[100, 200, 500, 1000].map((v) => (
                <option key={v} value={v}>
                  {v}円
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={saveThresholds}>
            候補条件を保存
          </button>
        </div>
        <p className="muted small">
          現在の候補条件：期待収益率 {formatPercent(settings.minExpectedReturnRate)} 以上、推定確率 {formatPercent(settings.minProbability)} 以上
        </p>
        {errors.length > 0 && (
          <ul className="input-errors" role="alert">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {savedMsg && <p className="ok-msg" role="status">{savedMsg}</p>}
      </div>

      <div className="panel">
        <h2>読み込みログ・エラー</h2>
        {loadLog.length === 0 ? (
          <p className="muted">ログはありません</p>
        ) : (
          <ul className="log">
            {loadLog.map((l, i) => (
              <li key={i} className={l.ok ? '' : 'warn'}>
                {l.ok ? '✓' : '✗'} {formatDateTime(l.at)} [{l.source === 'sample' ? 'サンプル' : '実データ'}] {l.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h2>保存データ</h2>
        <p className="muted small">分析記録 {records.length} 件はこのブラウザ（localStorage）にのみ保存され、外部へ送信されません。</p>
        <button
          type="button"
          className="btn btn--danger"
          disabled={records.length === 0}
          onClick={() => {
            if (window.confirm('すべての分析記録を削除します。よろしいですか？')) clearRecords();
          }}
        >
          すべての分析記録を削除
        </button>
      </div>
    </section>
  );
}
