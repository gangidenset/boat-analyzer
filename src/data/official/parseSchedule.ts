import { compactName, findDate, rateOrNull, splitVenueBlocks, toHalfWidth } from './text';

/** 番組表（B ファイル）1レース分 */
export interface ScheduleRace {
  date: string;
  venueId: string;
  raceNo: number;
  title: string;
  distance: number;
  /** 締切予定 HH:MM。見つからなければ null */
  deadline: string | null;
  entries: ScheduleEntry[];
}

export interface ScheduleEntry {
  boatNumber: number;
  racerId: string;
  name: string;
  age: number;
  branch: string;
  weight: number | null;
  grade: string;
  nationalWinRate: number | null;
  nationalTwoRate: number | null;
  localWinRate: number | null;
  localTwoRate: number | null;
  motorNumber: number;
  motorTwoRate: number | null;
  boatNumberNo: number;
  boatTwoRate: number | null;
}

// 例: "1 3788一宮稔弘53徳島53B2 5.46 35.44 6.17 50.00 53 34.70 59 29.53 434 22     9"
const ENTRY_RE =
  /^([1-6]) (\d{4})(\D+?)(\d{2})(\D+?)(\d{2,3})([AB][12])\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+)\s+(\d+\.\d+)\s+(\d+)\s+(\d+\.\d+)/;
// 例（半角化後）: "　1R  一般　　　　          H1800m  電話投票締切予定17:22"
const HEADER_RE = /^[\s　]*(\d{1,2})R[\s　]+(\S+?)[\s　].*?H(\d{3,4})m/;

export interface ParseIssue {
  message: string;
}

export function parseScheduleText(text: string): { races: ScheduleRace[]; issues: ParseIssue[] } {
  const races: ScheduleRace[] = [];
  const issues: ParseIssue[] = [];
  for (const block of splitVenueBlocks(text, 'B')) {
    const date = findDate(block.lines);
    if (!date) {
      issues.push({ message: `番組表 場${block.venueId}: 日付が見つかりません` });
      continue;
    }
    let current: ScheduleRace | null = null;
    for (const raw of block.lines) {
      const hw = toHalfWidth(raw);
      const h = hw.match(HEADER_RE);
      if (h) {
        const dl = hw.match(/締切予定\s*(\d{1,2}):(\d{2})/);
        current = {
          date,
          venueId: block.venueId,
          raceNo: Number(h[1]),
          title: h[2]!.replace(/　/g, ''),
          distance: Number(h[3]),
          deadline: dl ? `${dl[1]!.padStart(2, '0')}:${dl[2]}` : null,
          entries: [],
        };
        races.push(current);
        continue;
      }
      const e = raw.match(ENTRY_RE);
      if (e && current) {
        current.entries.push({
          boatNumber: Number(e[1]),
          racerId: e[2]!,
          name: compactName(e[3]!),
          age: Number(e[4]),
          branch: compactName(e[5]!),
          weight: Number(e[6]) || null,
          grade: e[7]!,
          nationalWinRate: rateOrNull(e[8]),
          nationalTwoRate: rateOrNull(e[9]),
          localWinRate: rateOrNull(e[10]),
          localTwoRate: rateOrNull(e[11]),
          motorNumber: Number(e[12]),
          motorTwoRate: rateOrNull(e[13]),
          boatNumberNo: Number(e[14]),
          boatTwoRate: rateOrNull(e[15]),
        });
      }
    }
  }
  for (const r of races) {
    if (r.entries.length !== 6) {
      issues.push({ message: `番組表 ${r.date} 場${r.venueId} ${r.raceNo}R: 出走表を${r.entries.length}艇分しか読めませんでした` });
    }
  }
  return { races, issues };
}
