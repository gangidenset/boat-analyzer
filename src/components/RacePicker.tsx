import type { Dataset, Race } from '../domain/types';
import { formatDate } from '../utils/format';
import { venueName } from '../utils/race';

/** 開催日・競艇場・レース番号で1レースを選ぶ */
export function RacePicker({ dataset, race, onChange }: { dataset: Dataset; race: Race; onChange: (raceId: string) => void }) {
  const dates = [...new Set(dataset.races.map((r) => r.date))].sort();
  const venues = [...new Set(dataset.races.filter((r) => r.date === race.date).map((r) => r.venueId))].sort();
  const raceNos = dataset.races.filter((r) => r.date === race.date && r.venueId === race.venueId).map((r) => r.raceNo).sort((a, b) => a - b);

  const select = (date: string, venueId: string, raceNo: number) => {
    const exact = dataset.races.find((r) => r.date === date && r.venueId === venueId && r.raceNo === raceNo);
    const fallback =
      dataset.races.find((r) => r.date === date && r.venueId === venueId) ?? dataset.races.find((r) => r.date === date);
    const target = exact ?? fallback;
    if (target) onChange(target.id);
  };

  return (
    <div className="filters" role="group" aria-label="レース選択">
      <label className="field">
        <span>開催日</span>
        <select value={race.date} onChange={(e) => select(e.target.value, race.venueId, race.raceNo)}>
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatDate(d)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>競艇場</span>
        <select value={race.venueId} onChange={(e) => select(race.date, e.target.value, race.raceNo)}>
          {venues.map((v) => (
            <option key={v} value={v}>
              {venueName(dataset, v)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>レース</span>
        <select value={race.raceNo} onChange={(e) => select(race.date, race.venueId, Number(e.target.value))}>
          {raceNos.map((n) => (
            <option key={n} value={n}>
              {n}R
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** URLの ?race= からレースを決める。無効なら既定のレース */
export function resolveRace(dataset: Dataset, raceId: string | null, prefer: (r: Race) => boolean = () => true): Race | null {
  return (
    (raceId ? dataset.races.find((r) => r.id === raceId) : undefined) ??
    dataset.races.find((r) => r.status === 'scheduled' && prefer(r)) ??
    dataset.races.find(prefer) ??
    dataset.races[0] ??
    null
  );
}
