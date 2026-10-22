import { describe, expect, it } from 'vitest';
import { allCombos, isHit, parseCombo, permutations } from '../src/analytics/combinations';

describe('買い目の組み合わせ', () => {
  it('件数：単勝6、2連単30、3連単120', () => {
    expect(allCombos('win')).toHaveLength(6);
    expect(allCombos('exacta')).toHaveLength(30);
    expect(allCombos('trifecta')).toHaveLength(120);
    expect(permutations(3, 3)).toHaveLength(6);
  });

  it('parseCombo は不正な買い目を拒否', () => {
    expect(parseCombo('1-2-3')).toEqual([1, 2, 3]);
    expect(parseCombo('1-1-3')).toBeNull();
    expect(parseCombo('0-2')).toBeNull();
    expect(parseCombo('7')).toBeNull();
    expect(parseCombo('a-b')).toBeNull();
  });

  it('isHit は券種ごとに着順を照合', () => {
    const order = [3, 1, 4, 2, 6, 5];
    expect(isHit('win', '3', order)).toBe(true);
    expect(isHit('exacta', '3-1', order)).toBe(true);
    expect(isHit('exacta', '1-3', order)).toBe(false);
    expect(isHit('trifecta', '3-1-4', order)).toBe(true);
    expect(isHit('trifecta', '3-1-2', order)).toBe(false);
    // 券種と買い目の長さが違う／着順が足りない
    expect(isHit('trifecta', '3-1', order)).toBe(false);
    expect(isHit('trifecta', '3-1-4', [3, 1])).toBe(false);
  });
});
