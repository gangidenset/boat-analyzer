import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EXHIBITION_METRICS, summarizeExhibition, type ExhibitionMetricKey } from '../analytics/exhibition';
import { BarChart } from '../components/BarChart';
import { BoatBadge } from '../components/Badges';
import { DataGate } from '../components/DataGate';
import { RacePicker, resolveRace } from '../components/RacePicker';
import { EmptyState } from '../components/StateViews';
import type { Dataset } from '../domain/types';
import { formatDateTime, formatNumber, NO_DATA } from '../utils/format';
import { raceLabel } from '../utils/race';

function ExhibitionView({ dataset }: { dataset: Dataset }) {
  const [params, setParams] = useSearchParams();
  const [chartMetric, setChartMetric] = useState<ExhibitionMetricKey>('exhibitionTime');
  const race = resolveRace(dataset, params.get('race'), (r) => r.exhibition !== null);
  if (!race) return <EmptyState title="レースデータがありません" />;
  const onChange = (id: string) => setParams({ race: id }, { replace: true });

  const picker = <RacePicker dataset={dataset} race={race} onChange={onChange} />;
  if (!race.exhibition) {
    return (
      <>
        {picker}
        <EmptyState title="展示情報はまだ発表されていません">
          {raceLabel(dataset, race)} の展示は未発表です。発表後に更新してください。
        </EmptyState>
      </>
    );
  }

  const ex = race.exhibition;
  const summary = summarizeExhibition(ex, race);
  const chart = summary.metrics.find((m) => m.key === chartMetric);
  const def = EXHIBITION_METRICS.find((m) => m.key === chartMetric);

  return (
    <>
      {picker}
      <p className="muted">
        {raceLabel(dataset, race)} ・ 展示発表 {formatDateTime(ex.publishedAt)} ・ 天候 {ex.weather} ・ 風 {ex.windDirection}{' '}
        {formatNumber(ex.windSpeed, 0)}m ・ 波 {formatNumber(ex.waveHeight, 0)}cm
      </p>
      <p className="muted small">
        数値はすべて「小さいほど良い」指標です。（ ）内は順位、★は最良。欠損値は0で埋めず「{NO_DATA}」と表示し、順位・平均から除外しています。
      </p>

      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">展示情報比較表</caption>
          <thead>
            <tr>
              <th scope="col">項目</th>
              {race.entries.map((e) => (
                <th scope="col" key={e.boatNumber} className="num">
                  <BoatBadge n={e.boatNumber} size="sm" />
                </th>
              ))}
              <th scope="col" className="num">平均</th>
              <th scope="col" className="num">欠損</th>
            </tr>
          </thead>
          <tbody>
            {summary.metrics.map((m) => {
              const d = EXHIBITION_METRICS.find((x) => x.key === m.key)!;
              return (
                <tr key={m.key}>
                  <th scope="row">{d.label}</th>
                  {m.values.map((v, i) => (
                    <td key={i} className={`num ${m.ranks[i] === 1 ? 'best' : ''}`}>
                      {race.entries[i]?.status === 'absent' ? (
                        <span className="muted">欠場</span>
                      ) : v === null ? (
                        <span className="na">{NO_DATA}</span>
                      ) : (
                        <>
                          {v.toFixed(d.digits)}
                          <span className="muted small">（{m.ranks[i]}）</span>
                          {m.ranks[i] === 1 && <span aria-label="最良"> ★</span>}
                        </>
                      )}
                    </td>
                  ))}
                  <td className="num">{formatNumber(m.average, d.digits)}</td>
                  <td className="num">{m.missingCount}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row">進入コース</th>
              {ex.entries.map((e) => (
                <td key={e.boatNumber} className="num">
                  {e.startCourse ?? NO_DATA}
                </td>
              ))}
              <td colSpan={2} />
            </tr>
            <tr>
              <th scope="row">チルト</th>
              {ex.entries.map((e) => (
                <td key={e.boatNumber} className="num">
                  {formatNumber(e.tilt, 1)}
                </td>
              ))}
              <td colSpan={2} />
            </tr>
            <tr>
              <th scope="row">部品交換</th>
              {ex.entries.map((e) => (
                <td key={e.boatNumber} className="num small">
                  {e.partsChanged.length ? e.partsChanged.join('・') : 'なし'}
                </td>
              ))}
              <td colSpan={2} />
            </tr>
            <tr>
              <th scope="row">平均順位</th>
              {summary.averageRank.map((r, i) => (
                <td key={i} className="num">
                  {formatNumber(r, 1)}
                </td>
              ))}
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <label className="field field--inline">
          <span>グラフ項目</span>
          <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value as ExhibitionMetricKey)}>
            {EXHIBITION_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {chart && def && (
          <BarChart
            title={`${def.label}（棒が長いほど速い／良い）`}
            invert
            data={chart.values.map((v, i) => ({
              label: `${i + 1}号艇`,
              value: v,
              display: v === null ? undefined : `${v.toFixed(def.digits)}${def.unit}`,
              highlight: chart.ranks[i] === 1,
            }))}
          />
        )}
        {chart && chart.availableCount === 0 && <p className="na">この場では {def?.label} のデータが提供されていません。</p>}
      </div>
      <Link to={`/odds?race=${race.id}`} className="btn">
        このレースの期待値を分析 →
      </Link>
    </>
  );
}

export function ExhibitionPage() {
  return (
    <section>
      <h1>展示情報比較</h1>
      <DataGate>{(dataset) => <ExhibitionView dataset={dataset} />}</DataGate>
    </section>
  );
}
