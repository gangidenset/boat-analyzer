import type { z } from 'zod';
import type {
  analysisRecordSchema,
  betTypeSchema,
  datasetMetaSchema,
  dataSourceKindSchema,
  entrySchema,
  exhibitionEntrySchema,
  exhibitionSchema,
  gradeSchema,
  historicalRaceSchema,
  oddsSchema,
  raceResultSchema,
  raceSchema,
  racerSchema,
  venueSchema,
} from './schemas';

export type Grade = z.infer<typeof gradeSchema>;
export type DataSourceKind = z.infer<typeof dataSourceKindSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Racer = z.infer<typeof racerSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type ExhibitionEntry = z.infer<typeof exhibitionEntrySchema>;
export type Exhibition = z.infer<typeof exhibitionSchema>;
export type Odds = z.infer<typeof oddsSchema>;
export type RaceResult = z.infer<typeof raceResultSchema>;
export type Race = z.infer<typeof raceSchema>;
export type HistoricalRace = z.infer<typeof historicalRaceSchema>;
export type DatasetMeta = z.infer<typeof datasetMetaSchema>;
export type BetType = z.infer<typeof betTypeSchema>;
export type AnalysisRecord = z.infer<typeof analysisRecordSchema>;

/** アプリが扱うデータ一式 */
export interface Dataset {
  meta: DatasetMeta;
  venues: Venue[];
  races: Race[];
  historicalRaces: HistoricalRace[];
}

export const BET_TYPE_LABEL: Record<BetType, string> = {
  win: '単勝',
  exacta: '2連単',
  trifecta: '3連単',
};

export const BET_TYPE_SIZE: Record<BetType, number> = { win: 1, exacta: 2, trifecta: 3 };

/** 成功 / 失敗を表す結果型。例外を投げずにエラーを扱うために使う。 */
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T,>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E,>(error: E): Result<never, E> => ({ ok: false, error });
