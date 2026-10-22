import { err } from '../domain/types';
import type { DataSource } from './dataSource';
import { indexedDbImportedStore, type ImportedStore } from './importedStore';
import { buildOfficialDataset } from './official/buildDataset';
import { validateDataset } from './validate';

export const OFFICIAL_PROVIDER = 'BOATRACE公式サイト ダウンロードデータ（番組表・競走成績、利用者が手動で取得）';

/**
 * 実データ取得元。
 *
 * 利用者が公式サイトから手動でダウンロード・解凍した番組表（B）・競走成績（K）のテキストを
 * 設定画面で取り込み、この端末の IndexedDB に保存したものを読む。
 * アプリ自身は公式サイトへ一切アクセスしない（自動取得・スクレイピングはしない）。
 */
export function createActualDataSource(store: ImportedStore = indexedDbImportedStore): DataSource {
  return {
    kind: 'actual',
    label: '実データ（取り込み済みの公式データ）',
    async load() {
      let data;
      try {
        data = await store.load();
      } catch (e) {
        return err({
          kind: 'load_failed',
          message: '取り込み済みデータを読み込めませんでした',
          issues: [e instanceof Error ? e.message : String(e)],
        });
      }
      if (!data || (data.schedules.length === 0 && data.results.length === 0)) {
        return err({
          kind: 'not_configured',
          message: '実データがまだ取り込まれていません',
          issues: [
            '設定画面の「実データの取り込み」から、公式サイトでダウンロード・解凍した番組表（B）・競走成績（K）のテキストファイルを選んでください。',
            'アプリから公式サイトへの自動アクセスはしません。手順は README の「実データ連携」を参照してください。',
          ],
        });
      }
      const built = buildOfficialDataset({ ...data, provider: OFFICIAL_PROVIDER });
      return validateDataset(built.dataset);
    },
  };
}

export const actualDataSource = createActualDataSource();
