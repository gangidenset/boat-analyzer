import { Link, useSearchParams } from 'react-router-dom';
import { filterRaces, uniqueDates, uniqueVenueIds, type RaceFilter } from '../analytics/raceFilters';
import { DataGate } from '../components/DataGate';
import { EmptyState } from '../components/StateViews';
import type { Dataset, Race } from '../domain/types';
import { formatDate } from '../utils/format';
import { RACE_STATUS_LABEL, venueName } from '../utils/race';

const STATUSES: Race['status'][] = ['scheduled', 'finished', 'cancelled'];

export function parseRaceFilter(params: URLSearchParams): RaceFilter {
  const raceNo = Number(params.get('raceNo'));
  const status = params.get('status');
  return {
    date: params.get('date') || 'all',
    venueId: params.get('venue') || 'all',
    raceNo: Number.isInteger(raceNo) && raceNo >= 1 && raceNo <= 12 ? raceNo : 'all',
    status: STATUSES.includes(status as Race['status']) ? (status as Race['status']) : 'all',
  };
}

function RaceList({ dataset }: { dataset: Dataset }) {
  const [params, setParams] = useSearchParams();
  const filter = parseRaceFilter(params);
  const races = filterRaces(dataset.races, filter);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="filters" role="search" aria-label="レース絞り込み">
        <label className="field">
          <span>開催日</span>
          <select value={filter.date} onChange={(e) => update('date', e.target.value)}>
            <option value="all">すべて</option>
            {uniqueDates(dataset.races).map((d) => (
              <option key={d} value={d}>
                {formatDate(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>競艇場</span>
          <select value={filter.venueId} onChange={(e) => update('venue', e.target.value)}>
            <option value="all">すべて</option>
            {uniqueVenueIds(dataset.races).map((v) => (
              <option key={v} value={v}>
                {venueName(dataset, v)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>レース番号</span>
          <select value={String(filter.raceNo)} onChange={(e) => update('raceNo', e.target.value)}>
            <option value="all">すべて</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}R
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>状態</span>
          <select value={filter.status} onChange={(e) => update('status', e.target.value)}>
            <option value="all">すべて</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {RACE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
          条件をクリア
        </button>
      </div>

      <p className="muted" aria-live="polite">
        該当 {races.length} レース
      </p>

      {races.length === 0 ? (
        <EmptyState title="条件に合うレースがありません">絞り込み条件を変更してください。</EmptyState>
      ) : (
        <ul className="race-grid">
          {races.map((r) => (
            <li key={r.id}>
              <Link className="race-card" to={`/races/${r.id}`}>
                <div className="race-card__head">
                  <span className="race-card__no">{r.raceNo}R</span>
                  <span>{venueName(dataset, r.venueId)}</span>
                  <span className={`status status--${r.status}`}>{RACE_STATUS_LABEL[r.status]}</span>
                </div>
                <div className="race-card__meta">
                  <span>{formatDate(r.date)}</span>
                  <span>締切 {r.deadline}</span>
                  <span>{r.title}</span>
                </div>
                <div className="race-card__flags">
                  <span>{r.exhibition ? '展示：発表済' : '展示：未発表'}</span>
                  <span>{r.odds ? 'オッズ：あり' : 'オッズ：未発表'}</span>
                  {r.entries.some((e) => e.status === 'absent') && <span className="warn">欠場あり</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function RacesPage() {
  return (
    <section>
      <h1>レース一覧・出走表</h1>
      <DataGate>{(dataset) => <RaceList dataset={dataset} />}</DataGate>
    </section>
  );
}
