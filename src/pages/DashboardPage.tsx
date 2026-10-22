import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { findCandidatesAcrossRaces } from '../analytics/candidates';
import { settleRecord, summarizeHistory } from '../analytics/history';
import { raceInsight } from '../analytics/insights';
import { BoatBadge, DivergenceMark, SignedRate } from '../components/Badges';
import { DataGate } from '../components/DataGate';
import { Disclaimer } from '../components/Disclaimer';
import { EmptyState } from '../components/StateViews';
import { BET_TYPE_LABEL, type Dataset } from '../domain/types';
import { useAppState } from '../state/AppState';
import { formatDate, formatOdds, formatPercent, formatSignedPercent } from '../utils/format';
import { venueName } from '../utils/race';
import { DataStatusTable } from './SettingsPage';
import { STATUS_LABEL } from './HistoryPage';

/** 「本日」= 発走前レースがある最も早い開催日（サンプルデータでは 2026-10-22） */
export function pickFocusDate(dataset: Dataset): string | null {
  const scheduled = dataset.races.filter((r) => r.status === 'scheduled').map((r) => r.date).sort();
  return scheduled[0] ?? [...dataset.races.map((r) => r.date)].sort().at(-1) ?? null;
}

function Dashboard({ dataset }: { dataset: Dataset }) {
  const { predictions, settings, records, model } = useAppState();
  const focusDate = pickFocusDate(dataset);
  const todays = dataset.races.filter((r) => r.date === focusDate);
  const winProbs = useMemo(() => {
    const m = new Map<string, number[] | null>();
    predictions.forEach((p, id) => m.set(id, p.ok ? p.value.probabilities : null));
    return m;
  }, [predictions]);

  const candidates = useMemo(
    () =>
      findCandidatesAcrossRaces(
        todays.filter((r) => r.status === 'scheduled'),
        winProbs,
        {
          betTypes: ['win', 'exacta', 'trifecta'],
          minExpectedReturnRate: settings.minExpectedReturnRate,
          minProbability: settings.minProbability,
          maxOdds: null,
          includeInvalid: false,
        },
        10,
      ),
    [todays, winProbs, settings.minExpectedReturnRate, settings.minProbability],
  );

  const notable = todays
    .map((r) => ({ race: r, insight: raceInsight(r, winProbs.get(r.id) ?? null) }))
    .filter((x) => x.insight.reasons.length > 0)
    .sort((a, b) => (a.insight.favoriteProbability ?? 1) - (b.insight.favoriteProbability ?? 1))
    .slice(0, 6);

  const settled = records.filter((r) => r.source === settings.dataMode).map((r) => settleRecord(r, dataset.races.find((x) => x.id === r.raceId)));
  const summary = summarizeHistory(settled, settings.dataMode);
  const byVenue = [...new Set(todays.map((r) => r.venueId))];
  const raceById = new Map(dataset.races.map((r) => [r.id, r]));

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <span className="stat__label">対象日</span>
          <span className="stat__value small">{focusDate ? formatDate(focusDate) : 'データなし'}</span>
        </div>
        <div className="stat">
          <span className="stat__label">レース数</span>
          <span className="stat__value">{todays.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">条件に合う候補</span>
          <span className="stat__value">{candidates.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">推定モデル</span>
          <span className="stat__value small">{model.name}</span>
        </div>
      </div>

      <section className="panel">
        <h2>レース一覧</h2>
        {todays.length === 0 ? (
          <EmptyState title="対象日のレースがありません" />
        ) : (
          byVenue.map((v) => (
            <div key={v} className="venue-row">
              <h3>{venueName(dataset, v)}</h3>
              <ul className="chips">
                {todays
                  .filter((r) => r.venueId === v)
                  .sort((a, b) => a.raceNo - b.raceNo)
                  .map((r) => (
                    <li key={r.id}>
                      <Link className={`chip chip--${r.status}`} to={`/races/${r.id}`} title={`締切 ${r.deadline}`}>
                        {r.raceNo}R <span className="small">{r.deadline}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>注目レース</h2>
          <p className="muted small">推定本命の1着率が低い混戦、1号艇以外が本命、展示タイム差が大きいレース</p>
          {notable.length === 0 ? (
            <EmptyState title="該当するレースはありません" />
          ) : (
            <ul className="list">
              {notable.map(({ race, insight }) => (
                <li key={race.id}>
                  <Link to={`/races/${race.id}`}>
                    {venueName(dataset, race.venueId)} {race.raceNo}R
                  </Link>{' '}
                  {insight.favoriteBoat && (
                    <span className="muted small">
                      本命 <BoatBadge n={insight.favoriteBoat} size="sm" /> {formatPercent(insight.favoriteProbability)}
                    </span>
                  )}
                  <div className="small">{insight.reasons.join(' ／ ')}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>期待値条件に合う候補</h2>
          <p className="muted small">
            期待収益率 {formatPercent(settings.minExpectedReturnRate)} 以上・推定確率 {formatPercent(settings.minProbability)} 以上（
            <Link to="/settings">条件を変更</Link>）
          </p>
          {candidates.length === 0 ? (
            <EmptyState title="条件に合う候補はありません" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">レース</th>
                    <th scope="col">買い目</th>
                    <th scope="col" className="num">オッズ</th>
                    <th scope="col" className="num">推定確率</th>
                    <th scope="col" className="num">期待収益率</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const r = raceById.get(c.raceId);
                    return (
                      <tr key={`${c.raceId}:${c.betType}:${c.combination}`}>
                        <td>
                          <Link to={`/odds?race=${c.raceId}`}>{r ? `${venueName(dataset, r.venueId)} ${r.raceNo}R` : c.raceId}</Link>
                        </td>
                        <td>
                          {BET_TYPE_LABEL[c.betType]} <span className="combo">{c.combination}</span>
                        </td>
                        <td className="num">{formatOdds(c.odds)}</td>
                        <td className="num">{formatPercent(c.probability, 2)}</td>
                        <td className="num">
                          <SignedRate value={c.expectedReturnRate} text={formatSignedPercent(c.expectedReturnRate)} />
                          <DivergenceMark warnings={c.warnings} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Disclaimer compact />
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>データ更新状況</h2>
          <DataStatusTable />
          <Link to="/settings" className="small">
            設定・データ管理へ →
          </Link>
        </section>
        <section className="panel">
          <h2>分析履歴</h2>
          <p className="small">
            記録 {summary.total}件 ・ 的中率 {formatPercent(summary.hitRate)} ・ 回収率 {formatPercent(summary.recoveryRate)}
          </p>
          {settled.length === 0 ? (
            <EmptyState title="記録はまだありません">オッズ・期待値画面で買い目を保存すると表示されます。</EmptyState>
          ) : (
            <ul className="list">
              {settled.slice(0, 5).map((s) => (
                <li key={s.record.id}>
                  {s.record.raceLabel} {BET_TYPE_LABEL[s.record.betType]} <span className="combo">{s.record.combination}</span> —{' '}
                  <span className={`settle settle--${s.status}`}>{STATUS_LABEL[s.status]}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/history" className="small">
            分析履歴へ →
          </Link>
        </section>
      </div>
    </>
  );
}

export function DashboardPage() {
  return (
    <section>
      <h1>ダッシュボード</h1>
      <DataGate>{(dataset) => <Dashboard dataset={dataset} />}</DataGate>
    </section>
  );
}
