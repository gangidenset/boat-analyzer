import { describe, expect, it } from 'vitest';
import { createActualDataSource } from '../src/data/actualDataSource';
import { MemoryImportedStore, mergeImported } from '../src/data/importedStore';
import { buildOfficialDataset } from '../src/data/official/buildDataset';
import { parseOfficialFiles } from '../src/data/official/importFiles';
import { parseResultsText } from '../src/data/official/parseResults';
import { parseScheduleText } from '../src/data/official/parseSchedule';
import { decodeOfficialFile, detectKind, toHalfWidth } from '../src/data/official/text';
import { validateDataset } from '../src/data/validate';
import { RESULTS_TEXT, SCHEDULE_TEXT, utf8 } from './officialFixtures';

describe('公式データの文字・形式', () => {
  it('Shift_JIS のバイト列を読める', () => {
    // "01KBGN成績" を Shift_JIS で表したもの（成=0x90AC, 績=0x90D1）
    const bytes = new Uint8Array([0x30, 0x31, 0x4b, 0x42, 0x47, 0x4e, 0x90, 0xac, 0x90, 0xd1]);
    expect(decodeOfficialFile(bytes)).toBe('01KBGN成績');
  });
  it('UTF-8 に変換済みのファイルも読める', () => {
    expect(decodeOfficialFile(utf8(RESULTS_TEXT))).toBe(RESULTS_TEXT);
  });
  it('番組表・競走成績を目印で判定', () => {
    expect(detectKind(SCHEDULE_TEXT)).toBe('schedule');
    expect(detectKind(RESULTS_TEXT)).toBe('results');
    expect(detectKind('hello')).toBe('unknown');
  });
  it('全角数字・英字を半角に（全角スペースは残す）', () => {
    expect(toHalfWidth('１２Ｒ　Ｈ１８００ｍ')).toBe('12R　H1800m');
  });
});

describe('番組表（B）の解析', () => {
  const { races, issues } = parseScheduleText(SCHEDULE_TEXT);
  it('レース・締切・出走表を読む', () => {
    expect(issues).toEqual([]);
    expect(races).toHaveLength(2);
    const r1 = races[0]!;
    expect(r1).toMatchObject({ date: '2026-10-20', venueId: '12', raceNo: 1, title: '予選', distance: 1800, deadline: '10:45' });
    expect(r1.entries).toHaveLength(6);
    expect(r1.entries[0]).toMatchObject({
      boatNumber: 1,
      racerId: '9001',
      name: '架空一郎',
      age: 45,
      branch: '大阪',
      weight: 52,
      grade: 'A1',
      nationalWinRate: 7.1,
      localWinRate: 7.3,
      motorNumber: 11,
      motorTwoRate: 41.2,
      boatNumberNo: 21,
      boatTwoRate: 33.1,
    });
  });
  it('勝率 0.00 は「データなし」（null）として扱う', () => {
    expect(races[0]!.entries[1]!.localWinRate).toBeNull();
    expect(races[0]!.entries[4]!.localTwoRate).toBeNull();
  });
  it('6艇そろわないレースは問題として報告', () => {
    const broken = SCHEDULE_TEXT.replace(/^6 9016.*$/m, '');
    expect(parseScheduleText(broken).issues[0]!.message).toContain('5艇分');
  });
});

describe('競走成績（K）の解析', () => {
  const { races, issues } = parseResultsText(RESULTS_TEXT);
  it('冒頭の払戻金一覧をレースと誤認しない', () => {
    expect(issues).toEqual([]);
    expect(races.map((r) => r.raceNo)).toEqual([1, 2]);
  });
  it('着順・展示タイム・進入・気象・決まり手・払戻を読む', () => {
    const r1 = races[0]!;
    expect(r1).toMatchObject({ weather: '晴', windDirection: '北東', windSpeed: 3, waveHeight: 2, kimarite: '逃げ' });
    expect(r1.entries[0]).toMatchObject({ rankCode: '01', rank: 1, boatNumber: 1, racerId: '9001', name: '架空一郎', exhibitionTime: 6.71, course: 1 });
    expect(r1.entries[4]).toMatchObject({ boatNumber: 6, course: 5 });
    expect(r1.payouts).toEqual({
      win: { combination: '1', payout: 150 },
      exacta: { combination: '1-3', payout: 560 },
      trifecta: { combination: '1-3-2', payout: 1230 },
    });
  });
  it('失格・欠場は着順なし、展示タイムの欠損は null', () => {
    const r2 = races[1]!;
    expect(r2.kimarite).toBe('差し');
    expect(r2.entries.find((e) => e.boatNumber === 3)).toMatchObject({ rankCode: 'S0', rank: null, course: 3 });
    expect(r2.entries.find((e) => e.boatNumber === 6)).toMatchObject({ rankCode: 'K0', rank: null, course: null, exhibitionTime: null });
    expect(r2.entries.find((e) => e.boatNumber === 4)!.exhibitionTime).toBeNull();
  });
});

describe('アプリ形式への変換', () => {
  const schedules = parseScheduleText(SCHEDULE_TEXT).races;
  const results = parseResultsText(RESULTS_TEXT).races;
  const built = buildOfficialDataset({ schedules, results, importedAt: '2026-10-21T09:00:00+09:00', provider: 'テスト' });

  it('スキーマ検証に合格し、デモではない実データとして扱う', () => {
    const v = validateDataset(built.dataset);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.meta).toMatchObject({ source: 'actual', isDemo: false });
    expect(v.value.meta.updatedAt.odds).toBeNull();
    expect(v.value.races).toHaveLength(2);
  });
  it('結果・欠場・展示・オッズなしを反映', () => {
    const v = validateDataset(built.dataset);
    if (!v.ok) throw new Error('invalid');
    const [r1, r2] = v.value.races;
    expect(r1!.status).toBe('finished');
    expect(r1!.result!.finishOrder).toEqual([1, 3, 2, 4, 6, 5]);
    expect(r1!.odds).toBeNull();
    expect(r1!.exhibition!.entries[5]).toMatchObject({ exhibitionTime: 6.77, startCourse: 5, straightTime: null });
    expect(r2!.entries[5]!.status).toBe('absent');
    expect(r2!.result!.finishOrder).toEqual([2, 1, 5, 4]);
  });
  it('過去レース（場別統計用）は着順のない艇を出走数に数えない', () => {
    const h2 = built.dataset.historicalRaces[1]!;
    expect(h2.rows.find((r) => r.boatNumber === 3)!.rank).toBeNull();
    expect(h2.rows.find((r) => r.boatNumber === 6)).toMatchObject({ course: 6, rank: null });
    expect(new Set(h2.rows.map((r) => r.course)).size).toBe(6);
  });
  it('番組表だけのレースは発走前として扱う', () => {
    const only = buildOfficialDataset({ schedules, results: [], importedAt: '2026-10-21T09:00:00+09:00', provider: 'テスト' });
    const v = validateDataset(only.dataset);
    expect(v.ok && v.value.races.every((r) => r.status === 'scheduled' && r.exhibition === null)).toBe(true);
  });
});

describe('取り込み', () => {
  it('ファイルを判定して取り込み、LZHや無関係なファイルは理由付きで除外', () => {
    const r = parseOfficialFiles(
      [
        { name: 'B261020.TXT', bytes: utf8(SCHEDULE_TEXT) },
        { name: 'K261020.TXT', bytes: utf8(RESULTS_TEXT) },
        { name: 'k261020.lzh', bytes: new Uint8Array([1, 2, 3]) },
        { name: 'memo.txt', bytes: utf8('hello') },
      ],
      '2026-10-21T09:00:00+09:00',
    );
    expect(r.data.schedules).toHaveLength(2);
    expect(r.data.results).toHaveLength(2);
    expect(r.data.files.map((f) => f.kind)).toEqual(['schedule', 'results']);
    expect(r.issues.some((i) => i.includes('LZH'))).toBe(true);
    expect(r.issues.some((i) => i.startsWith('memo.txt'))).toBe(true);
  });

  it('同じレースを再取り込みしても重複しない', () => {
    const a = parseOfficialFiles([{ name: 'K.TXT', bytes: utf8(RESULTS_TEXT) }], '2026-10-21T09:00:00+09:00').data;
    const merged = mergeImported(a, { ...a, importedAt: '2026-10-22T09:00:00+09:00' });
    expect(merged.results).toHaveLength(2);
    expect(merged.files).toHaveLength(1);
    expect(merged.importedAt).toBe('2026-10-22T09:00:00+09:00');
  });

  it('実データ取得元：未取り込みなら案内付きエラー、取り込み後は読める', async () => {
    const store = new MemoryImportedStore();
    const source = createActualDataSource(store);
    const before = await source.load();
    expect(!before.ok && before.error.kind).toBe('not_configured');
    await store.save(
      parseOfficialFiles(
        [
          { name: 'B.TXT', bytes: utf8(SCHEDULE_TEXT) },
          { name: 'K.TXT', bytes: utf8(RESULTS_TEXT) },
        ],
        '2026-10-21T09:00:00+09:00',
      ).data,
    );
    const after = await source.load();
    expect(after.ok && after.value.races).toHaveLength(2);
  });
});
