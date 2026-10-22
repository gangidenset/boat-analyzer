import type { z } from 'zod';
import {
  datasetMetaSchema,
  historicalRaceSchema,
  raceSchema,
  venueSchema,
} from '../domain/schemas';
import type { Dataset } from '../domain/types';
import { err, ok, type Result } from '../domain/types';
import type { DataLoadError } from './dataSource';

const MAX_ISSUES = 20;

function formatIssues(file: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${file}: ${i.path.join('.') || '(root)'} - ${i.message}`);
}

/** 生のJSONを検証して Dataset に変換する。1件でも不正があればエラーを返す */
export function validateDataset(raw: {
  meta: unknown;
  venues: unknown;
  races: unknown;
  historicalRaces: unknown;
}): Result<Dataset, DataLoadError> {
  const issues: string[] = [];
  const meta = datasetMetaSchema.safeParse(raw.meta);
  if (!meta.success) issues.push(...formatIssues('meta', meta.error));
  const venues = venueSchema.array().safeParse(raw.venues);
  if (!venues.success) issues.push(...formatIssues('venues', venues.error));
  const races = raceSchema.array().safeParse(raw.races);
  if (!races.success) issues.push(...formatIssues('races', races.error));
  const hist = historicalRaceSchema.array().safeParse(raw.historicalRaces);
  if (!hist.success) issues.push(...formatIssues('historicalRaces', hist.error));

  if (meta.success && venues.success && races.success) {
    const venueIds = new Set(venues.data.map((v) => v.id));
    const ids = new Set<string>();
    for (const r of races.data) {
      if (!venueIds.has(r.venueId)) issues.push(`races: ${r.id} - 未定義の競艇場ID ${r.venueId}`);
      if (ids.has(r.id)) issues.push(`races: ${r.id} - レースIDが重複しています`);
      ids.add(r.id);
      const boats = r.entries.map((e) => e.boatNumber).sort().join('');
      if (boats !== '123456') issues.push(`races: ${r.id} - 艇番が1〜6で揃っていません`);
    }
  }

  if (issues.length > 0 || !meta.success || !venues.success || !races.success || !hist.success) {
    const shown = issues.slice(0, MAX_ISSUES);
    if (issues.length > MAX_ISSUES) shown.push(`…ほか${issues.length - MAX_ISSUES}件`);
    return err({ kind: 'validation', message: 'データの検証に失敗しました', issues: shown });
  }
  return ok({ meta: meta.data, venues: venues.data, races: races.data, historicalRaces: hist.data });
}
