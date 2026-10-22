import { err } from '../domain/types';
import type { DataSource } from './dataSource';
import { validateDataset } from './validate';

/** 同梱のサンプル（デモ）データ。JSONは別チャンクとして遅延読み込みする */
export const sampleDataSource: DataSource = {
  kind: 'sample',
  label: 'サンプルデータ（デモ）',
  async load() {
    try {
      const [meta, venues, races, historicalRaces] = await Promise.all([
        import('./sample/meta.json'),
        import('./sample/venues.json'),
        import('./sample/races.json'),
        import('./sample/historical-races.json'),
      ]);
      return validateDataset({
        meta: meta.default,
        venues: venues.default,
        races: races.default,
        historicalRaces: historicalRaces.default,
      });
    } catch (e) {
      return err({
        kind: 'load_failed',
        message: 'サンプルデータの読み込みに失敗しました',
        issues: [e instanceof Error ? e.message : String(e)],
      });
    }
  },
};
