import type { Dataset, Race } from '../domain/types';
import { formatDate } from './format';

export function venueName(dataset: Dataset, venueId: string): string {
  return dataset.venues.find((v) => v.id === venueId)?.name ?? `場${venueId}`;
}

export function raceLabel(dataset: Dataset, race: Race): string {
  return `${formatDate(race.date)} ${venueName(dataset, race.venueId)} ${race.raceNo}R`;
}

export const RACE_STATUS_LABEL: Record<Race['status'], string> = {
  scheduled: '発売中・発走前',
  finished: '確定',
  cancelled: '中止',
};
