import type { ReactNode } from 'react';
import type { Dataset } from '../domain/types';
import { useAppState } from '../state/AppState';
import { ErrorState, LoadingState } from './StateViews';

/** データの読み込み状態に応じて 読み込み中 / エラー / 本体 を切り替える */
export function DataGate({ children }: { children: (dataset: Dataset) => ReactNode }) {
  const { data, reload } = useAppState();
  if (data.status === 'loading') return <LoadingState />;
  if (data.status === 'error') return <ErrorState error={data.error} onRetry={reload} />;
  return <>{children(data.dataset)}</>;
}
