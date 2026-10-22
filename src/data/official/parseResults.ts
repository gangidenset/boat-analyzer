import type { ParseIssue } from './parseSchedule';
import { compactName, findDate, splitVenueBlocks, toHalfWidth } from './text';

/** 競走成績（K ファイル）1レース分 */
export interface ResultRace {
  date: string;
  venueId: string;
  raceNo: number;
  title: string;
  distance: number;
  weather: string | null;
  windDirection: string | null;
  windSpeed: number | null;
  waveHeight: number | null;
  kimarite: string;
  entries: ResultEntry[];
  payouts: {
    win: { combination: string; payout: number } | null;
    exacta: { combination: string; payout: number } | null;
    trifecta: { combination: string; payout: number } | null;
  };
}

export interface ResultEntry {
  /** 着順の表記（"01"〜"06"、"F"=フライング、"L0"/"L1"=出遅れ、"K0"/"K1"=欠場、"S0"〜"S2"=失格 など） */
  rankCode: string;
  /** 着順。失格・欠場などは null */
  rank: number | null;
  boatNumber: number;
  racerId: string;
  name: string;
  motorNumber: number | null;
  boatNumberNo: number | null;
  exhibitionTime: number | null;
  /** 本番の進入コース */
  course: number | null;
}

// 例（半角化後）: "    1R       一般　　　　                 H1800m  曇り  風  南　　 2m  波　 2cm"
const HEADER_RE = /^\s*(\d{1,2})R[\s　]+(\S+?)[\s　].*?H(\d{3,4})m/;
const WEATHER_RE = /H\d{3,4}m[\s　]+(\S+?)[\s　]+風[\s　]+(\S+?)[\s　]+(\d+)m[\s　]+波[\s　]+(\d+)cm/;
// 例: "   01  1 3788 一　宮　　稔　弘 53   59  6.71   1    0.07     2.03.6"
const ENTRY_RE = /^\s*(\d{2}|[A-Z]\d?)\s+([1-6])\s+(\d{4})\s+(\D+?)\s*(\d.*)?$/;

const intOrNull = (s: string | undefined) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : null);

export function parseResultsText(text: string): { races: ResultRace[]; issues: ParseIssue[] } {
  const races: ResultRace[] = [];
  const issues: ParseIssue[] = [];
  for (const block of splitVenueBlocks(text, 'K')) {
    const date = findDate(block.lines);
    if (!date) {
      issues.push({ message: `競走成績 場${block.venueId}: 日付が見つかりません` });
      continue;
    }
    let current: ResultRace | null = null;
    for (const raw of block.lines) {
      const line = toHalfWidth(raw);
      // 冒頭の払戻金一覧（"1R  1-4-5  1970 ..."）と区別するため、距離（H1800m）がある行だけをレースの見出しとする
      const h = line.match(HEADER_RE);
      if (h) {
        const w = line.match(WEATHER_RE);
        current = {
          date,
          venueId: block.venueId,
          raceNo: Number(h[1]),
          title: h[2]!.replace(/　/g, ''),
          distance: Number(h[3]),
          weather: w ? w[1]! : null,
          windDirection: w ? w[2]!.replace(/　/g, '') : null,
          windSpeed: w ? Number(w[3]) : null,
          waveHeight: w ? Number(w[4]) : null,
          kimarite: '',
          entries: [],
          payouts: { win: null, exacta: null, trifecta: null },
        };
        races.push(current);
        continue;
      }
      if (!current) continue;
      if (/着\s*艇\s*登番/.test(line)) {
        current.kimarite = line.trim().split(/[\s　]+/).at(-1) ?? '';
        if (/ﾚｰｽﾀｲﾑ|レースタイム/.test(current.kimarite)) current.kimarite = '';
        continue;
      }
      const e = line.match(ENTRY_RE);
      if (e) {
        const fields = (e[5] ?? '').trim().split(/\s+/);
        const rankCode = e[1]!;
        const rank = /^0[1-6]$/.test(rankCode) ? Number(rankCode) : null;
        const ex = fields[2] !== undefined && /^\d\.\d{2}$/.test(fields[2]) ? Number(fields[2]) : null;
        const course = intOrNull(fields[3]);
        current.entries.push({
          rankCode,
          rank,
          boatNumber: Number(e[2]),
          racerId: e[3]!,
          name: compactName(e[4]!),
          motorNumber: intOrNull(fields[0]),
          boatNumberNo: intOrNull(fields[1]),
          exhibitionTime: ex,
          course: course !== null && course >= 1 && course <= 6 ? course : null,
        });
        continue;
      }
      const win = line.match(/^\s*単勝\s+(\d)\s+([\d,]+)/);
      if (win && !current.payouts.win) current.payouts.win = { combination: win[1]!, payout: Number(win[2]!.replace(/,/g, '')) };
      const ex = line.match(/^\s*2連単\s+(\d)-(\d)\s+([\d,]+)/);
      if (ex && !current.payouts.exacta)
        current.payouts.exacta = { combination: `${ex[1]}-${ex[2]}`, payout: Number(ex[3]!.replace(/,/g, '')) };
      const tri = line.match(/^\s*3連単\s+(\d)-(\d)-(\d)\s+([\d,]+)/);
      if (tri && !current.payouts.trifecta)
        current.payouts.trifecta = { combination: `${tri[1]}-${tri[2]}-${tri[3]}`, payout: Number(tri[4]!.replace(/,/g, '')) };
    }
  }
  for (const r of races) {
    if (r.entries.length === 0) issues.push({ message: `競走成績 ${r.date} 場${r.venueId} ${r.raceNo}R: 出走艇を読めませんでした` });
  }
  return { races, issues };
}
