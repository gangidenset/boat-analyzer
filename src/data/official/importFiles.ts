import type { ImportedData } from '../importedStore';
import { parseResultsText } from './parseResults';
import { parseScheduleText } from './parseSchedule';
import { decodeOfficialFile, detectKind } from './text';

export interface ImportSummary {
  data: ImportedData;
  /** 読めなかったファイルや行の説明 */
  issues: string[];
}

/** 取り込むファイルの上限（1ファイルあたり）。公式の1日分のテキストは数百KB程度 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 解凍済みの公式テキスト（B/K）を読み、取り込み用データにする */
export function parseOfficialFiles(files: readonly { name: string; bytes: Uint8Array }[], importedAt: string): ImportSummary {
  const data: ImportedData = { schedules: [], results: [], importedAt, files: [] };
  const issues: string[] = [];
  for (const f of files) {
    if (/\.lzh$/i.test(f.name)) {
      issues.push(`${f.name}: LZH圧縮のままです。解凍してからテキストファイル（.TXT）を選んでください`);
      continue;
    }
    if (f.bytes.byteLength > MAX_FILE_BYTES) {
      issues.push(`${f.name}: ファイルが大きすぎます（10MBまで）`);
      continue;
    }
    const text = decodeOfficialFile(f.bytes);
    const kind = detectKind(text);
    if (kind === 'schedule') {
      const r = parseScheduleText(text);
      data.schedules.push(...r.races);
      issues.push(...r.issues.map((i) => `${f.name}: ${i.message}`));
      data.files.push({ name: f.name, kind, races: r.races.length });
    } else if (kind === 'results') {
      const r = parseResultsText(text);
      data.results.push(...r.races);
      issues.push(...r.issues.map((i) => `${f.name}: ${i.message}`));
      data.files.push({ name: f.name, kind, races: r.races.length });
    } else {
      issues.push(`${f.name}: 公式の番組表（B）・競走成績（K）ファイルとして認識できません`);
    }
  }
  return { data, issues };
}
