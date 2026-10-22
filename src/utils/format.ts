/** 表示用フォーマッタ。欠損値は 0 ではなく「データなし」を返す */
export const NO_DATA = 'データなし';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function formatNumber(v: number | null | undefined, digits = 2, fallback = NO_DATA): string {
  return isNum(v) ? v.toFixed(digits) : fallback;
}

export function formatPercent(v: number | null | undefined, digits = 1, fallback = NO_DATA): string {
  return isNum(v) ? `${(v * 100).toFixed(digits)}%` : fallback;
}

/** 期待収益率など符号付きの割合（+12.3% / −5.0%） */
export function formatSignedPercent(v: number | null | undefined, digits = 1, fallback = '算出不可'): string {
  if (!isNum(v)) return fallback;
  const s = (v * 100).toFixed(digits);
  return v > 0 ? `+${s}%` : v < 0 ? `−${s.replace('-', '')}%` : `${s}%`;
}

export function formatOdds(v: number | null | undefined, fallback = '—'): string {
  return isNum(v) ? `${v.toFixed(1)}倍` : fallback;
}

export function formatYen(v: number | null | undefined, fallback = NO_DATA): string {
  return isNum(v) ? `${Math.round(v).toLocaleString('ja-JP')}円` : fallback;
}

/** ISO日時を「10/22 13:35」形式（日本時間）で表示 */
export function formatDateTime(iso: string | null | undefined, fallback = NO_DATA): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return date;
  const wd = '日月火水木金土'[new Date(Date.UTC(+y, +m - 1, +d)).getUTCDay()] ?? '';
  return `${y}/${m}/${d}（${wd}）`;
}
