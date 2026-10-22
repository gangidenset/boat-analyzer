import { describe, expect, it } from 'vitest';
import { actualDataSource } from '../src/data/actualDataSource';
import { sampleDataSource } from '../src/data/sampleDataSource';
import { validateDataset } from '../src/data/validate';
import meta from '../src/data/sample/meta.json';
import venues from '../src/data/sample/venues.json';
import races from '../src/data/sample/races.json';
import historicalRaces from '../src/data/sample/historical-races.json';
import { formatDate, formatNumber, formatOdds, formatPercent, formatSignedPercent, NO_DATA } from '../src/utils/format';
import { loadJson, saveJson } from '../src/utils/storage';
import { z } from 'zod';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('サンプルデータ', () => {
  it('スキーマ検証に合格し、デモデータとして明示されている', async () => {
    const r = await sampleDataSource.load();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.meta.isDemo).toBe(true);
    expect(r.value.meta.source).toBe('sample');
    expect(r.value.races.length).toBeGreaterThan(0);
    expect(r.value.historicalRaces.length).toBeGreaterThan(100);
  });

  it('確認用のケース（欠場・展示未発表・オッズ未発表・展示欠損）を含む', async () => {
    const r = await sampleDataSource.load();
    if (!r.ok) throw new Error('load failed');
    const rs = r.value.races;
    expect(rs.some((x) => x.entries.some((e) => e.status === 'absent'))).toBe(true);
    expect(rs.some((x) => x.exhibition === null)).toBe(true);
    expect(rs.some((x) => x.odds === null)).toBe(true);
    expect(rs.some((x) => x.exhibition?.entries.some((e) => e.exhibitionTime === null))).toBe(true);
    expect(rs.some((x) => x.status === 'finished' && x.result)).toBe(true);
  });
});

describe('データ検証', () => {
  const raw = () => ({ meta: clone(meta), venues: clone(venues), races: clone(races), historicalRaces: clone(historicalRaces) });

  it('不正な値を検出し、箇所を示す', () => {
    const d = raw();
    (d.races[0] as { raceNo: number }).raceNo = 13;
    const r = validateDataset(d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('validation');
      expect(r.error.issues.join('\n')).toContain('races: 0.raceNo');
    }
  });

  it('レースID重複・未定義の競艇場を検出', () => {
    const d = raw();
    (d.races[1] as { id: string }).id = (d.races[0] as { id: string }).id;
    (d.races[2] as { venueId: string }).venueId = '99';
    const r = validateDataset(d);
    expect(!r.ok && r.error.issues.join('\n')).toMatch(/重複[\s\S]*|未定義/);
    if (!r.ok) {
      expect(r.error.issues.some((i) => i.includes('重複'))).toBe(true);
      expect(r.error.issues.some((i) => i.includes('未定義の競艇場ID 99'))).toBe(true);
    }
  });

  it('JSONでない値（null）も安全にエラー', () => {
    const r = validateDataset({ meta: null, venues: null, races: null, historicalRaces: null });
    expect(r.ok).toBe(false);
  });

  it('実データ取得元は未設定エラーを返し、通信しない', async () => {
    const r = await actualDataSource.load();
    expect(!r.ok && r.error.kind).toBe('not_configured');
  });
});

describe('表示フォーマット', () => {
  it('欠損は「データなし」', () => {
    expect(formatNumber(null)).toBe(NO_DATA);
    expect(formatPercent(undefined)).toBe(NO_DATA);
    expect(formatNumber(Number.NaN)).toBe(NO_DATA);
    expect(formatNumber(0)).toBe('0.00');
  });
  it('符号付き割合とオッズ', () => {
    expect(formatSignedPercent(0.123)).toBe('+12.3%');
    expect(formatSignedPercent(-0.05)).toBe('−5.0%');
    expect(formatSignedPercent(null)).toBe('算出不可');
    expect(formatOdds(12.34)).toBe('12.3倍');
    expect(formatDate('2026-10-22')).toBe('2026/10/22（木）');
  });
});

describe('localStorage ラッパー', () => {
  it('壊れた値は既定値に戻す', () => {
    localStorage.setItem('k', '{broken');
    expect(loadJson('k', z.number(), 5)).toBe(5);
    saveJson('k', 'text');
    expect(loadJson('k', z.number(), 5)).toBe(5);
    saveJson('k', 7);
    expect(loadJson('k', z.number(), 5)).toBe(7);
  });
});
