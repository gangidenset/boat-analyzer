import { BET_TYPE_SIZE, type BetType } from '../domain/types';

/** 1〜n から k 個を選ぶ順列（"1-2-3" 形式の文字列配列） */
export function permutations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const rec = (prefix: number[]) => {
    if (prefix.length === k) {
      out.push([...prefix]);
      return;
    }
    for (let i = 1; i <= n; i++) if (!prefix.includes(i)) rec([...prefix, i]);
  };
  rec([]);
  return out;
}

export const comboKey = (combo: readonly number[]): string => combo.join('-');

export function parseCombo(key: string): number[] | null {
  const parts = key.split('-').map((s) => Number(s));
  if (parts.length === 0 || parts.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) return null;
  if (new Set(parts).size !== parts.length) return null;
  return parts;
}

export function allCombos(betType: BetType): number[][] {
  return permutations(6, BET_TYPE_SIZE[betType]);
}

/** 着順（艇番の配列）に対して、その買い目が的中しているか */
export function isHit(betType: BetType, combination: string, finishOrder: readonly number[]): boolean {
  const combo = parseCombo(combination);
  const size = BET_TYPE_SIZE[betType];
  if (!combo || combo.length !== size || finishOrder.length < size) return false;
  return combo.every((b, i) => finishOrder[i] === b);
}
