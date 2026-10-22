import { Link, useParams } from 'react-router-dom';
import { BoatBadge, GradeBadge } from '../components/Badges';
import { DataGate } from '../components/DataGate';
import { EmptyState } from '../components/StateViews';
import type { Dataset, Race } from '../domain/types';
import { useAppState } from '../state/AppState';
import { formatDateTime, formatNumber, formatOdds, formatPercent } from '../utils/format';
import { RACE_STATUS_LABEL, raceLabel, venueName } from '../utils/race';

function EntryTable({ race, winProbs }: { race: Race; winProbs: number[] | null }) {
  return (
    <>
      {/* PC: 表（横スクロール対応） */}
      <div className="table-wrap only-desktop">
        <table className="table">
          <caption className="sr-only">出走表</caption>
          <thead>
            <tr>
              <th scope="col">艇</th>
              <th scope="col">選手</th>
              <th scope="col">級別</th>
              <th scope="col">支部/年齢</th>
              <th scope="col" className="num">全国勝率</th>
              <th scope="col" className="num">当地勝率</th>
              <th scope="col" className="num">平均ST</th>
              <th scope="col" className="num">モーター</th>
              <th scope="col" className="num">ボート</th>
              <th scope="col" className="num">F/L</th>
              <th scope="col" className="num">単勝</th>
              <th scope="col" className="num">推定1着率</th>
            </tr>
          </thead>
          <tbody>
            {race.entries.map((e, i) => (
              <tr key={e.boatNumber} className={e.status === 'absent' ? 'is-absent' : undefined}>
                <td>
                  <BoatBadge n={e.boatNumber} />
                </td>
                <td>
                  <div className="racer-name">{e.racer.name}</div>
                  <div className="muted small">{e.racer.id}{e.status === 'absent' && ' ・欠場'}</div>
                </td>
                <td>
                  <GradeBadge grade={e.racer.grade} />
                </td>
                <td>
                  {e.racer.branch}/{e.racer.age}歳
                </td>
                <td className="num">{formatNumber(e.racer.nationalWinRate)}</td>
                <td className="num">{formatNumber(e.racer.localWinRate)}</td>
                <td className="num">{formatNumber(e.racer.averageStartTiming)}</td>
                <td className="num">
                  No.{e.motor.number}
                  <div className="muted small">2連 {formatPercent(e.motor.twoRate === null ? null : e.motor.twoRate / 100)}</div>
                </td>
                <td className="num">
                  No.{e.boat.number}
                  <div className="muted small">2連 {formatPercent(e.boat.twoRate === null ? null : e.boat.twoRate / 100)}</div>
                </td>
                <td className="num">
                  {e.flyingCount}/{e.lateCount}
                </td>
                <td className="num">{formatOdds(race.odds?.win[String(e.boatNumber)], 'データなし')}</td>
                <td className="num">{e.status === 'absent' ? '欠場' : formatPercent(winProbs?.[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* スマートフォン: カード表示 */}
      <ul className="entry-cards only-mobile">
        {race.entries.map((e, i) => (
          <li key={e.boatNumber} className={e.status === 'absent' ? 'entry-card is-absent' : 'entry-card'}>
            <div className="entry-card__head">
              <BoatBadge n={e.boatNumber} />
              <span className="racer-name">{e.racer.name}</span>
              <GradeBadge grade={e.racer.grade} />
              {e.status === 'absent' && <span className="warn">欠場</span>}
            </div>
            <dl className="kv">
              <dt>全国勝率</dt>
              <dd>{formatNumber(e.racer.nationalWinRate)}</dd>
              <dt>当地勝率</dt>
              <dd>{formatNumber(e.racer.localWinRate)}</dd>
              <dt>モーター</dt>
              <dd>
                No.{e.motor.number}（2連 {formatPercent(e.motor.twoRate === null ? null : e.motor.twoRate / 100)}）
              </dd>
              <dt>単勝</dt>
              <dd>{formatOdds(race.odds?.win[String(e.boatNumber)], 'データなし')}</dd>
              <dt>推定1着率</dt>
              <dd>{e.status === 'absent' ? '欠場' : formatPercent(winProbs?.[i])}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function RaceDetail({ dataset, raceId }: { dataset: Dataset; raceId: string }) {
  const { predictions } = useAppState();
  const race = dataset.races.find((r) => r.id === raceId);
  if (!race) {
    return (
      <EmptyState title="レースが見つかりません">
        <Link to="/races">レース一覧へ戻る</Link>
      </EmptyState>
    );
  }
  const pred = predictions.get(race.id);
  const siblings = dataset.races.filter((r) => r.date === race.date && r.venueId === race.venueId).sort((a, b) => a.raceNo - b.raceNo);
  const idx = siblings.findIndex((r) => r.id === race.id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];

  return (
    <>
      <div className="page-head">
        <h1>
          {venueName(dataset, race.venueId)} {race.raceNo}R <span className="muted small">{race.title}</span>
        </h1>
        <p className="muted">
          {raceLabel(dataset, race)} ・ 締切 {race.deadline} ・ {race.distance}m ・ {RACE_STATUS_LABEL[race.status]}
        </p>
        <nav className="button-row" aria-label="レース移動・関連画面">
          {prev ? <Link className="btn btn--ghost" to={`/races/${prev.id}`}>← {prev.raceNo}R</Link> : null}
          {next ? <Link className="btn btn--ghost" to={`/races/${next.id}`}>{next.raceNo}R →</Link> : null}
          <Link className="btn" to={`/exhibition?race=${race.id}`}>展示情報を比較</Link>
          <Link className="btn" to={`/odds?race=${race.id}`}>オッズ・期待値を分析</Link>
        </nav>
      </div>

      <h2>出走表</h2>
      {!pred?.ok && <p className="warn">推定確率：{pred ? pred.error.message : '計算できません'}</p>}
      <EntryTable race={race} winProbs={pred?.ok ? pred.value.probabilities : null} />

      {race.result && (
        <section className="panel">
          <h2>レース結果</h2>
          <p>
            着順：
            {race.result.finishOrder.map((b, i) => (
              <span key={b} className="result-boat">
                {i + 1}着 <BoatBadge n={b} size="sm" />
              </span>
            ))}
          </p>
          <p>決まり手：{race.result.kimarite}</p>
          <p className="muted small">
            払戻：単勝 {race.result.payouts.win?.combination ?? '—'} {race.result.payouts.win?.payout ?? '—'}円 ／ 2連単{' '}
            {race.result.payouts.exacta?.combination ?? '—'} {race.result.payouts.exacta?.payout ?? '—'}円 ／ 3連単{' '}
            {race.result.payouts.trifecta?.combination ?? '—'} {race.result.payouts.trifecta?.payout ?? '—'}円
          </p>
        </section>
      )}
      <p className="muted small">オッズ取得時刻：{formatDateTime(race.odds?.fetchedAt)}</p>
    </>
  );
}

export function RaceDetailPage() {
  const { raceId = '' } = useParams();
  return (
    <section>
      <DataGate>{(dataset) => <RaceDetail dataset={dataset} raceId={raceId} />}</DataGate>
    </section>
  );
}
