import { err } from '../domain/types';
import type { DataSource } from './dataSource';

/**
 * 実データ取得元（未実装のスタブ）。
 *
 * 利用許諾を確認できた提供元が決まるまで、外部への通信は一切行わない。
 * 連携時はこのファイルで提供元のデータを取得し、validateDataset() で検証してから返す。
 * 手順は docs/data-sources.md を参照。
 */
export const actualDataSource: DataSource = {
  kind: 'actual',
  label: '実データ',
  async load() {
    return err({
      kind: 'not_configured',
      message: '実データの取得元が未設定です',
      issues: [
        '利用規約・許諾を確認できたデータ提供元がまだ設定されていません。',
        '外部への通信は行っていません。設定画面で「サンプルデータ」に切り替えると操作できます。',
        '連携手順は docs/data-sources.md を参照してください。',
      ],
    });
  },
};
