import type { Race } from '../domain/types';
import { exhibitionTimeSpread } from './exhibition';

/** レースの特徴量（注目レース抽出用） */
export interface RaceInsight {
  raceId: string;
  favoriteBoat: number | null;
  favoriteProbability: number | null;
  /** 正規化エントロピー（0=本命が確実〜1=完全に横並び）。混戦度の目安 */
  openness: number | null;
  exhibitionSpread: number | null;
  reasons: string[];
}

export function normalizedEntropy(probs: readonly number[]): number | null {
  const p = probs.filter((x) => x > 0);
  if (p.length < 2) return p.length === 1 ? 0 : null;
  const h = -p.reduce((s, x) => s + x * Math.log(x), 0);
  return h / Math.log(probs.length);
}

export const OPEN_RACE_FAVORITE_MAX = 0.4;
export const EXHIBITION_SPREAD_MIN = 0.2;

export function raceInsight(race: Race, winProbs: readonly number[] | null): RaceInsight {
  const reasons: string[] = [];
  let favoriteBoat: number | null = null;
  let favoriteProbability: number | null = null;
  let openness: number | null = null;
  if (winProbs) {
    favoriteProbability = Math.max(...winProbs);
    favoriteBoat = winProbs.indexOf(favoriteProbability) + 1;
    openness = normalizedEntropy(winProbs);
    if (favoriteProbability < OPEN_RACE_FAVORITE_MAX) reasons.push('混戦（本命の推定1着率40%未満）');
    if (favoriteBoat !== 1) reasons.push(`1号艇以外が推定本命（${favoriteBoat}号艇）`);
  }
  const spread = exhibitionTimeSpread(race.exhibition);
  if (spread !== null && spread >= EXHIBITION_SPREAD_MIN) reasons.push(`展示タイム差が大きい（${spread.toFixed(2)}秒）`);
  return { raceId: race.id, favoriteBoat, favoriteProbability, openness, exhibitionSpread: spread, reasons };
}
