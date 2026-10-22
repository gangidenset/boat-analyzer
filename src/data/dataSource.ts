import type { DataSourceKind, Dataset } from '../domain/types';
import type { Result } from '../domain/types';

export type DataLoadErrorKind = 'not_configured' | 'validation' | 'load_failed';

export interface DataLoadError {
  kind: DataLoadErrorKind;
  message: string;
  /** 検証エラーの詳細（どのファイルのどの項目か） */
  issues: string[];
}

/**
 * データ取得元の抽象化。
 * サンプルデータと実データで同じインターフェースを実装し、UIは取得元を意識しない。
 */
export interface DataSource {
  kind: DataSourceKind;
  label: string;
  load(): Promise<Result<Dataset, DataLoadError>>;
}
