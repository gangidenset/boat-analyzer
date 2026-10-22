import { VENUES } from '../../domain/venues';
import type { ResultRace } from './parseResults';
import type { ScheduleRace } from './parseSchedule';

/**
 * 公式の番組表（B）と競走成績（K）から、アプリのデータ形式（未検証の生データ）を組み立てる。
 * 返した値は validateDataset() で検証してから使う。
 *
 * - 出走表は番組表から作る（番組表のないレースは出走表を作れないので、場別統計用の過去レースにだけ入れる）。
 * - 競走成績があれば結果・払戻・展示タイム・本番の進入コース・気象を付ける。
 * - 公式ダウンロードデータにはオッズが含まれないため odds は常に null（期待値は計算しない）。
 * - 直線・回り足・周回展示・展示ST・チルト・部品交換も含まれないため null / 空。
 */
const pad2 = (n: number) => String(n).padStart(2, '0');
const key = (r: { date: string; venueId: string; raceNo: number }) => `${r.date}_${r.venueId}_${pad2(r.raceNo)}`;
const GRADES = new Set(['A1', 'A2', 'B1', 'B2']);
const ABSENT = /^K/; // K0 / K1 = 欠場

export function buildOfficialDataset(input: {
  schedules: readonly ScheduleRace[];
  results: readonly ResultRace[];
  importedAt: string;
  provider: string;
}) {
  const resultByKey = new Map(input.results.map((r) => [key(r), r]));
  const skipped: string[] = [];

  const races = input.schedules
    .filter((s) => {
      const okEntries = s.entries.length === 6 && s.entries.every((e) => GRADES.has(e.grade));
      if (!okEntries) skipped.push(`${key(s)}: 出走表が6艇分そろっていないため除外`);
      return okEntries;
    })
    .map((s) => {
      const res = resultByKey.get(key(s));
      const resEntry = (boat: number) => res?.entries.find((e) => e.boatNumber === boat);
      const ranked = res ? res.entries.filter((e) => e.rank !== null).sort((a, b) => a.rank! - b.rank!) : [];
      const status = !res ? 'scheduled' : ranked.length > 0 ? 'finished' : 'cancelled';
      const deadline = s.deadline ?? '00:00';
      return {
        id: key(s),
        date: s.date,
        venueId: s.venueId,
        raceNo: s.raceNo,
        title: s.title,
        deadline,
        distance: s.distance,
        status,
        entries: s.entries.map((e) => ({
          boatNumber: e.boatNumber,
          status: ABSENT.test(resEntry(e.boatNumber)?.rankCode ?? '') ? 'absent' : 'entered',
          racer: {
            id: e.racerId,
            name: e.name,
            grade: e.grade,
            branch: e.branch,
            age: e.age,
            weight: e.weight,
            nationalWinRate: e.nationalWinRate,
            localWinRate: e.localWinRate,
            averageStartTiming: null,
          },
          motor: { number: e.motorNumber, twoRate: e.motorTwoRate },
          boat: { number: e.boatNumberNo, twoRate: e.boatTwoRate },
          flyingCount: 0,
          lateCount: 0,
        })),
        exhibition: res
          ? {
              publishedAt: `${s.date}T${deadline}:00+09:00`,
              weather: res.weather ?? '',
              windSpeed: res.windSpeed,
              windDirection: res.windDirection ?? '',
              waveHeight: res.waveHeight,
              entries: [1, 2, 3, 4, 5, 6].map((boat) => {
                const r = resEntry(boat);
                return {
                  boatNumber: boat,
                  exhibitionTime: r?.exhibitionTime ?? null,
                  straightTime: null,
                  turnTime: null,
                  lapTime: null,
                  startCourse: r?.course ?? null,
                  startTiming: null,
                  tilt: null,
                  partsChanged: [],
                };
              }),
            }
          : null,
        odds: null,
        result:
          status === 'finished' && res
            ? { finishOrder: ranked.map((e) => e.boatNumber), kimarite: res.kimarite, payouts: res.payouts }
            : null,
      };
    });

  // 過去レース（場別統計・モデル用）：競走成績のあるレースすべて
  const historicalRaces = input.results
    .filter((r) => r.entries.some((e) => e.rank !== null))
    .map((r) => {
      const used = new Set(r.entries.map((e) => e.course).filter((c): c is number => c !== null));
      const free = [1, 2, 3, 4, 5, 6].filter((c) => !used.has(c));
      return {
        date: r.date,
        venueId: r.venueId,
        raceNo: r.raceNo,
        weather: r.weather ?? '',
        windSpeed: r.windSpeed,
        waveHeight: r.waveHeight,
        kimarite: r.kimarite,
        rows: [1, 2, 3, 4, 5, 6].map((boat) => {
          const e = r.entries.find((x) => x.boatNumber === boat);
          // 欠場などで進入が分からない艇は空いているコースに割り当て、着順なし（統計の出走数に数えない）
          const course = e?.course ?? free.shift() ?? boat;
          return { course, boatNumber: boat, rank: e?.course != null ? e.rank : null };
        }),
      };
    });

  const hasResults = input.results.length > 0;
  return {
    dataset: {
      meta: {
        source: 'actual',
        isDemo: false,
        provider: input.provider,
        description: '利用者が公式サイトから手動でダウンロードし、取り込んだ番組表・競走成績です（オッズは含まれません）。',
        generatedAt: input.importedAt,
        updatedAt: {
          races: input.schedules.length ? input.importedAt : null,
          exhibition: hasResults ? input.importedAt : null,
          odds: null,
          results: hasResults ? input.importedAt : null,
          historical: hasResults ? input.importedAt : null,
        },
      },
      venues: VENUES,
      races,
      historicalRaces,
    },
    skipped,
  };
}
