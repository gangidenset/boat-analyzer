import { z } from 'zod';

/**
 * データの実行時検証スキーマ。
 * TypeScript の型（types.ts）はこのスキーマから生成しているため、
 * 「型」と「検証ルール」が食い違うことはありません。
 */

const nullableNumber = z.number().finite().nullable();
const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/, 'ISO8601日時ではありません');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式ではありません');
export const boatNumberSchema = z.number().int().min(1).max(6);

export const gradeSchema = z.enum(['A1', 'A2', 'B1', 'B2']);
export const dataSourceKindSchema = z.enum(['sample', 'actual']);

export const venueSchema = z.object({
  id: z.string().regex(/^\d{2}$/),
  name: z.string().min(1),
  hasOriginalExhibition: z.boolean(),
});

export const racerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  grade: gradeSchema,
  branch: z.string(),
  age: z.number().int().min(15).max(80),
  weight: nullableNumber,
  nationalWinRate: nullableNumber,
  localWinRate: nullableNumber,
  averageStartTiming: nullableNumber,
});

export const entrySchema = z.object({
  boatNumber: boatNumberSchema,
  status: z.enum(['entered', 'absent']),
  racer: racerSchema,
  motor: z.object({ number: z.number().int(), twoRate: nullableNumber }),
  boat: z.object({ number: z.number().int(), twoRate: nullableNumber }),
  flyingCount: z.number().int().min(0),
  lateCount: z.number().int().min(0),
});

export const exhibitionEntrySchema = z.object({
  boatNumber: boatNumberSchema,
  exhibitionTime: nullableNumber,
  straightTime: nullableNumber,
  turnTime: nullableNumber,
  lapTime: nullableNumber,
  startCourse: boatNumberSchema.nullable(),
  startTiming: nullableNumber,
  tilt: nullableNumber,
  partsChanged: z.array(z.string()),
});

export const exhibitionSchema = z.object({
  publishedAt: isoDateTime,
  weather: z.string(),
  windSpeed: nullableNumber,
  windDirection: z.string(),
  waveHeight: nullableNumber,
  entries: z.array(exhibitionEntrySchema).length(6),
});

/** オッズ表（キーは "1" / "1-2" / "1-2-3"）。値が null は発売なし・欠場等。 */
const oddsTable = z.record(z.string().regex(/^[1-6](-[1-6]){0,2}$/), z.number().nullable());

export const oddsSchema = z.object({
  fetchedAt: isoDateTime,
  win: oddsTable,
  exacta: oddsTable,
  trifecta: oddsTable,
});

const payoutSchema = z.object({ combination: z.string(), payout: z.number().int().min(0) });

export const raceResultSchema = z.object({
  finishOrder: z.array(boatNumberSchema).min(1).max(6),
  kimarite: z.string(),
  payouts: z.object({
    win: payoutSchema.nullable(),
    exacta: payoutSchema.nullable(),
    trifecta: payoutSchema.nullable(),
  }),
});

export const raceSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  venueId: z.string().regex(/^\d{2}$/),
  raceNo: z.number().int().min(1).max(12),
  title: z.string(),
  deadline: z.string().regex(/^\d{2}:\d{2}$/),
  distance: z.number().int().positive(),
  status: z.enum(['scheduled', 'finished', 'cancelled']),
  entries: z.array(entrySchema).length(6),
  exhibition: exhibitionSchema.nullable(),
  odds: oddsSchema.nullable(),
  result: raceResultSchema.nullable(),
});

export const historicalRaceSchema = z.object({
  date: isoDate,
  venueId: z.string().regex(/^\d{2}$/),
  raceNo: z.number().int().min(1).max(12),
  weather: z.string(),
  windSpeed: nullableNumber,
  waveHeight: nullableNumber,
  kimarite: z.string(),
  rows: z
    .array(
      z.object({
        course: boatNumberSchema,
        boatNumber: boatNumberSchema,
        rank: z.number().int().min(1).max(6).nullable(),
      }),
    )
    .length(6),
});

export const datasetMetaSchema = z.object({
  source: dataSourceKindSchema,
  isDemo: z.boolean(),
  provider: z.string(),
  description: z.string(),
  generatedAt: isoDateTime,
  updatedAt: z.object({
    races: isoDateTime.nullable(),
    exhibition: isoDateTime.nullable(),
    odds: isoDateTime.nullable(),
    results: isoDateTime.nullable(),
    historical: isoDateTime.nullable(),
  }),
});

export const betTypeSchema = z.enum(['win', 'exacta', 'trifecta']);

/** 利用者が保存した分析記録（localStorage に保存） */
export const analysisRecordSchema = z.object({
  id: z.string(),
  createdAt: isoDateTime,
  source: dataSourceKindSchema,
  raceId: z.string(),
  raceLabel: z.string(),
  modelId: z.string(),
  betType: betTypeSchema,
  combination: z.string(),
  odds: z.number().finite(),
  probability: z.number().min(0).max(1),
  expectedReturnRate: z.number().finite(),
  stake: z.number().int().positive(),
  oddsFetchedAt: isoDateTime.nullable(),
});
export const analysisRecordListSchema = z.array(analysisRecordSchema);
