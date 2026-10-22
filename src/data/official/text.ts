/** 公式データ（テキスト）の共通処理 */

/** 全角の数字・英字・記号（！〜～）を半角に。全角スペースはそのまま残す */
export function toHalfWidth(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 名前の空白（全角・半角）を取り除く */
export const compactName = (s: string): string => s.replace(/[\s　]+/g, '');

/**
 * 公式ファイルは Shift_JIS。ブラウザ・Node の TextDecoder で読む。
 * すでに UTF-8 に変換済みのファイルにも対応する（UTF-8 として正しく読め、目印があればそれを使う）。
 */
export function decodeOfficialFile(bytes: Uint8Array): string {
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/[KB]BGN/.test(utf8)) return utf8;
  } catch {
    // UTF-8 ではない → Shift_JIS として読む
  }
  return new TextDecoder('shift_jis').decode(bytes);
}

export type OfficialFileKind = 'schedule' | 'results' | 'unknown';

/** 番組表（B）か競走成績（K）かを、ファイル内の目印（STARTB / 01BBGN など）で判定 */
export function detectKind(text: string): OfficialFileKind {
  if (/\d{2}KBGN/.test(text)) return 'results';
  if (/\d{2}BBGN/.test(text)) return 'schedule';
  return 'unknown';
}

/** "01BBGN" 〜 "01BEND" のように場ごとに区切られた区間を取り出す */
export function splitVenueBlocks(text: string, marker: 'B' | 'K'): { venueId: string; lines: string[] }[] {
  const blocks: { venueId: string; lines: string[] }[] = [];
  let current: { venueId: string; lines: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const begin = raw.match(new RegExp(`^(\\d{2})${marker}BGN`));
    if (begin) {
      current = { venueId: begin[1]!, lines: [] };
      blocks.push(current);
      continue;
    }
    if (new RegExp(`^\\d{2}${marker}END`).test(raw)) {
      current = null;
      continue;
    }
    current?.lines.push(raw);
  }
  return blocks;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2025/ 3/10" または "２０２５年　３月１０日" から YYYY-MM-DD */
export function findDate(lines: readonly string[]): string | null {
  for (const raw of lines.slice(0, 30)) {
    const line = toHalfWidth(raw);
    const m = line.match(/(\d{4})\/\s*(\d{1,2})\/\s*(\d{1,2})/) ?? line.match(/(\d{4})年[\s　]*(\d{1,2})月[\s　]*(\d{1,2})日/);
    if (m) return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
  }
  return null;
}

/** 数値に変換。0.00 は「データなし」として null にする（新人・当地未出走などで0が入るため） */
export function rateOrNull(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
