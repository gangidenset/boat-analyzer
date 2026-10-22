import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  buildCandidates,
  DEFAULT_CANDIDATE_FILTER,
  filterCandidates,
  sortCandidates,
  type CandidateFilter,
  type CandidateSortKey,
} from '../analytics/candidates';
import { MODELS, getModel } from '../analytics/probabilityModel';
import { BoatBadge, DemoBadge, DivergenceMark, SignedRate } from '../components/Badges';
import { DataGate } from '../components/DataGate';
import { Disclaimer } from '../components/Disclaimer';
import { RacePicker, resolveRace } from '../components/RacePicker';
import { EmptyState } from '../components/StateViews';
import { BET_TYPE_LABEL, type BetType, type Dataset } from '../domain/types';
import { useAppState } from '../state/AppState';
import { formatDateTime, formatNumber, formatOdds, formatPercent, formatSignedPercent } from '../utils/format';
import { raceLabel } from '../utils/race';

const PAGE_SIZE = 30;
const BET_TYPES: BetType[] = ['win', 'exacta', 'trifecta'];

/** 入力文字列を数値に。空欄は null、不正値は undefined（＝入力エラー） */
export function parseOptionalNumber(s: string): number | null | undefined {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function OddsView({ dataset }: { dataset: Dataset }) {
  const { predictions, settings, updateSettings, addRecord } = useAppState();
  const [params, setParams] = useSearchParams();
  const race = resolveRace(dataset, params.get('race'), (r) => r.odds !== null);
  const [filter, setFilter] = useState<CandidateFilter>({ ...DEFAULT_CANDIDATE_FILTER, betTypes: ['trifecta'] });
  const [minEvText, setMinEvText] = useState('');
  const [minProbText, setMinProbText] = useState('');
  const [maxOddsText, setMaxOddsText] = useState('');
  const [sortKey, setSortKey] = useState<CandidateSortKey>('expectedReturnRate');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [saved, setSaved] = useState<string | null>(null);

  const pred = race ? predictions.get(race.id) : undefined;
  const winProbs = pred?.ok ? pred.value.probabilities : null;
  const all = useMemo(() => (race && winProbs ? buildCandidates(race, winProbs, BET_TYPES) : []), [race, winProbs]);

  if (!race) return <EmptyState title="レースデータがありません" />;
  const model = getModel(settings.modelId);

  // 入力検証（不正な数値はフィルタに反映せずエラー表示）
  const minEv = parseOptionalNumber(minEvText);
  const minProb = parseOptionalNumber(minProbText);
  const maxOdds = parseOptionalNumber(maxOddsText);
  const inputErrors: string[] = [];
  if (minEv === undefined) inputErrors.push('期待収益率の下限は数値で入力してください');
  if (minProb === undefined || (typeof minProb === 'number' && (minProb < 0 || minProb > 100)))
    inputErrors.push('推定確率の下限は0〜100(%)で入力してください');
  if (maxOdds === undefined || (typeof maxOdds === 'number' && maxOdds < 1)) inputErrors.push('オッズ上限は1.0以上で入力してください');

  const effective: CandidateFilter = {
    ...filter,
    minExpectedReturnRate: typeof minEv === 'number' ? minEv / 100 : null,
    minProbability: typeof minProb === 'number' && minProb >= 0 && minProb <= 100 ? minProb / 100 : 0,
    maxOdds: typeof maxOdds === 'number' && maxOdds >= 1 ? maxOdds : null,
  };
  const rows = sortCandidates(filterCandidates(all, effective), sortKey);
  const invalidCount = all.filter((c) => c.error && filter.betTypes.includes(c.betType)).length;

  const toggleBetType = (b: BetType) =>
    setFilter((f) => ({ ...f, betTypes: f.betTypes.includes(b) ? f.betTypes.filter((x) => x !== b) : [...f.betTypes, b] }));

  return (
    <>
      <RacePicker dataset={dataset} race={race} onChange={(id) => { setParams({ race: id }, { replace: true }); setLimit(PAGE_SIZE); }} />
      <Disclaimer />
      <div className="panel">
        <div className="filters">
          <label className="field">
            <span>推定モデル</span>
            <select value={settings.modelId} onChange={(e) => updateSettings({ modelId: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（未検証）
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">{model.description}</p>
        <p className="muted small">
          {raceLabel(dataset, race)} ・ オッズ取得時刻：<strong>{formatDateTime(race.odds?.fetchedAt)}</strong>
          {dataset.meta.isDemo && (
            <>
              {' '}
              <DemoBadge />
            </>
          )}
        </p>
        {pred && pred.ok && (
          <p className="muted small">
            使用した要素：{pred.value.usedFactors.join('、')}
            {pred.value.missingFactors.length > 0 && <> ／ 欠損のため未使用：{pred.value.missingFactors.join('、')}</>}
            ／ 根拠の過去レース数：{pred.value.sampleSize}
          </p>
        )}
      </div>

      {!pred || !pred.ok ? (
        <EmptyState title="推定確率を計算できません">{pred && !pred.ok ? pred.error.message : '予測がありません'}</EmptyState>
      ) : !race.odds ? (
        <EmptyState title="オッズが未発表です">オッズ発表後にデータを更新してください。期待値は計算できません。</EmptyState>
      ) : (
        <>
          <h2>各艇の推定1着確率とオッズ</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">艇</th>
                  <th scope="col" className="num">推定1着確率</th>
                  <th scope="col" className="num">単勝オッズ</th>
                  <th scope="col" className="num">オッズ逆算確率</th>
                  <th scope="col" className="num">期待払戻倍率</th>
                  <th scope="col" className="num">期待収益率</th>
                </tr>
              </thead>
              <tbody>
                {race.entries.map((e, i) => {
                  const c = all.find((x) => x.betType === 'win' && x.combination === String(e.boatNumber));
                  return (
                    <tr key={e.boatNumber}>
                      <td>
                        <BoatBadge n={e.boatNumber} /> {e.racer.name}
                      </td>
                      <td className="num">{e.status === 'absent' ? '欠場' : formatPercent(winProbs?.[i])}</td>
                      <td className="num">{formatOdds(c?.odds, 'データなし')}</td>
                      <td className="num">{formatPercent(c?.impliedProbability)}</td>
                      <td className="num">{c?.expectedPayoutRatio == null ? '算出不可' : `${formatNumber(c.expectedPayoutRatio, 2)}倍`}</td>
                      <td className="num">
                        <SignedRate value={c?.expectedReturnRate ?? null} text={formatSignedPercent(c?.expectedReturnRate)} />
                        <DivergenceMark warnings={c?.warnings ?? []} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2>買い目別 期待値</h2>
          <div className="panel">
            <fieldset className="checks">
              <legend>券種</legend>
              {BET_TYPES.map((b) => (
                <label key={b} className="check">
                  <input type="checkbox" checked={filter.betTypes.includes(b)} onChange={() => toggleBetType(b)} />
                  {BET_TYPE_LABEL[b]}
                </label>
              ))}
            </fieldset>
            <div className="filters">
              <label className="field">
                <span>期待収益率の下限（%）</span>
                <input inputMode="decimal" placeholder="例: 10" value={minEvText} onChange={(e) => setMinEvText(e.target.value)} />
              </label>
              <label className="field">
                <span>推定確率の下限（%）</span>
                <input inputMode="decimal" placeholder="例: 1" value={minProbText} onChange={(e) => setMinProbText(e.target.value)} />
              </label>
              <label className="field">
                <span>オッズ上限（倍）</span>
                <input inputMode="decimal" placeholder="例: 100" value={maxOddsText} onChange={(e) => setMaxOddsText(e.target.value)} />
              </label>
              <label className="field">
                <span>並び順</span>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as CandidateSortKey)}>
                  <option value="expectedReturnRate">期待収益率が高い順</option>
                  <option value="probability">推定確率が高い順</option>
                  <option value="odds">オッズが高い順</option>
                  <option value="combination">買い目順</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={filter.includeInvalid}
                  onChange={(e) => setFilter((f) => ({ ...f, includeInvalid: e.target.checked }))}
                />
                算出不可も表示（{invalidCount}件）
              </label>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => updateSettings({ minExpectedReturnRate: effective.minExpectedReturnRate ?? settings.minExpectedReturnRate })}
                disabled={effective.minExpectedReturnRate === null}
              >
                この下限をダッシュボード条件に設定
              </button>
            </div>
            {inputErrors.length > 0 && (
              <ul className="input-errors" role="alert">
                {inputErrors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>

          <p className="muted" aria-live="polite">
            該当 {rows.length} 件（{Math.min(limit, rows.length)}件表示）
          </p>
          {saved && (
            <p className="ok-msg" role="status">
              {saved}
            </p>
          )}
          {rows.length === 0 ? (
            <EmptyState title="条件に合う買い目がありません">条件を緩めるか、券種を選択してください。</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table" data-testid="candidate-table">
                <thead>
                  <tr>
                    <th scope="col">券種</th>
                    <th scope="col">買い目</th>
                    <th scope="col" className="num">オッズ</th>
                    <th scope="col" className="num">推定確率</th>
                    <th scope="col" className="num">期待払戻倍率</th>
                    <th scope="col" className="num">期待収益率</th>
                    <th scope="col">記録</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((c) => (
                    <tr key={`${c.betType}:${c.combination}`}>
                      <td>{BET_TYPE_LABEL[c.betType]}</td>
                      <td className="combo">{c.combination}</td>
                      <td className="num">
                        {formatOdds(c.odds, 'データなし')}
                        {c.warnings.includes('unusually_high') && <span className="warn small"> ⚠高額</span>}
                      </td>
                      <td className="num">{formatPercent(c.probability, 2)}</td>
                      <td className="num">{c.expectedPayoutRatio === null ? '算出不可' : `${c.expectedPayoutRatio.toFixed(2)}倍`}</td>
                      <td className="num">
                        {c.error ? (
                          <span className="muted small">算出不可：{c.error.message}</span>
                        ) : (
                          <>
                            <SignedRate value={c.expectedReturnRate} text={formatSignedPercent(c.expectedReturnRate)} />
                            <DivergenceMark warnings={c.warnings} />
                          </>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--small"
                          disabled={!!c.error}
                          onClick={() => {
                            if (c.error || c.odds === null || c.expectedReturnRate === null) return;
                            addRecord({
                              raceId: race.id,
                              raceLabel: raceLabel(dataset, race),
                              modelId: model.id,
                              betType: c.betType,
                              combination: c.combination,
                              odds: c.odds,
                              probability: c.probability,
                              expectedReturnRate: c.expectedReturnRate,
                              oddsFetchedAt: race.odds?.fetchedAt ?? null,
                            });
                            setSaved(`${BET_TYPE_LABEL[c.betType]} ${c.combination} を分析履歴に保存しました`);
                          }}
                        >
                          保存
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > limit && (
            <button type="button" className="btn btn--ghost" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              さらに{PAGE_SIZE}件表示
            </button>
          )}
        </>
      )}
    </>
  );
}

export function OddsPage() {
  return (
    <section>
      <h1>オッズ・期待値分析</h1>
      <DataGate>{(dataset) => <OddsView dataset={dataset} />}</DataGate>
    </section>
  );
}
