import { useMemo, useState } from 'react';
import {
  computeCourseStats,
  filterHistoricalRaces,
  WAVE_BAND_LABEL,
  WIND_BAND_LABEL,
  type VenueStatsFilter,
  type WaveBand,
  type WindBand,
} from '../analytics/venueStats';
import { BarChart } from '../components/BarChart';
import { BoatBadge } from '../components/Badges';
import { DataGate } from '../components/DataGate';
import { EmptyState } from '../components/StateViews';
import type { Dataset } from '../domain/types';
import { formatDate, formatPercent } from '../utils/format';
import { venueName } from '../utils/race';

/** これ未満の件数では統計のばらつきが大きいと警告する */
export const SMALL_SAMPLE_WARNING = 100;

function VenueStatsView({ dataset }: { dataset: Dataset }) {
  const [filter, setFilter] = useState<VenueStatsFilter>({ venueId: 'all', windBand: 'all', waveBand: 'all' });
  const venueIds = useMemo(() => [...new Set(dataset.historicalRaces.map((r) => r.venueId))].sort(), [dataset]);
  const target = useMemo(() => filterHistoricalRaces(dataset.historicalRaces, filter), [dataset, filter]);
  const stats = useMemo(() => computeCourseStats(target), [target]);
  const set = (patch: Partial<VenueStatsFilter>) => setFilter((f) => ({ ...f, ...patch }));

  if (dataset.historicalRaces.length === 0) {
    return <EmptyState title="過去レースデータがありません">場別統計には過去の競走成績データが必要です。</EmptyState>;
  }

  return (
    <>
      <div className="filters" role="search" aria-label="統計条件">
        <label className="field">
          <span>競艇場</span>
          <select value={filter.venueId} onChange={(e) => set({ venueId: e.target.value })}>
            <option value="all">全場</option>
            {venueIds.map((v) => (
              <option key={v} value={v}>
                {venueName(dataset, v)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>風速</span>
          <select value={filter.windBand} onChange={(e) => set({ windBand: e.target.value as WindBand })}>
            {(Object.keys(WIND_BAND_LABEL) as WindBand[]).map((k) => (
              <option key={k} value={k}>
                {WIND_BAND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>波高</span>
          <select value={filter.waveBand} onChange={(e) => set({ waveBand: e.target.value as WaveBand })}>
            {(Object.keys(WAVE_BAND_LABEL) as WaveBand[]).map((k) => (
              <option key={k} value={k}>
                {WAVE_BAND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>期間（開始）</span>
          <input type="date" value={filter.dateFrom ?? ''} onChange={(e) => set({ dateFrom: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>期間（終了）</span>
          <input type="date" value={filter.dateTo ?? ''} onChange={(e) => set({ dateTo: e.target.value || undefined })} />
        </label>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat__label">対象件数</span>
          <span className="stat__value" data-testid="sample-races">
            {stats.sampleRaces.toLocaleString('ja-JP')}レース
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">対象期間</span>
          <span className="stat__value small">
            {stats.period ? `${formatDate(stats.period.from)} 〜 ${formatDate(stats.period.to)}` : 'データなし'}
          </span>
        </div>
      </div>
      {stats.sampleRaces > 0 && stats.sampleRaces < SMALL_SAMPLE_WARNING && (
        <p className="warn" role="note">
          ⚠ 対象件数が{SMALL_SAMPLE_WARNING}レース未満です。偶然による偏りが大きいため参考程度にしてください。
        </p>
      )}

      {stats.sampleRaces === 0 ? (
        <EmptyState title="条件に合う過去レースがありません">条件を緩めてください。</EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">コース別成績</caption>
              <thead>
                <tr>
                  <th scope="col">コース</th>
                  <th scope="col" className="num">出走数</th>
                  <th scope="col" className="num">1着率</th>
                  <th scope="col" className="num">2連対率</th>
                  <th scope="col" className="num">3連対率</th>
                </tr>
              </thead>
              <tbody>
                {stats.courses.map((c) => (
                  <tr key={c.course}>
                    <td>
                      <BoatBadge n={c.course} size="sm" /> {c.course}コース
                    </td>
                    <td className="num">{c.starts}</td>
                    <td className="num">{formatPercent(c.winRate)}</td>
                    <td className="num">{formatPercent(c.top2Rate)}</td>
                    <td className="num">{formatPercent(c.top3Rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid-2">
            <div className="panel">
              <BarChart
                title="コース別1着率"
                max={1}
                data={stats.courses.map((c) => ({ label: `${c.course}コース`, value: c.winRate, display: formatPercent(c.winRate) }))}
              />
            </div>
            <div className="panel">
              <BarChart
                title="決まり手の割合"
                max={1}
                data={stats.kimarite.map((k) => ({ label: k.name, value: k.rate, display: `${formatPercent(k.rate)}（${k.count}）` }))}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function VenuesPage() {
  return (
    <section>
      <h1>競艇場別・コース別分析</h1>
      <DataGate>{(dataset) => <VenueStatsView dataset={dataset} />}</DataGate>
    </section>
  );
}
