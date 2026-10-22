import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DataLoadError } from '../data/dataSource';

export function LoadingState({ label = 'データを読み込んでいます…' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty" role="status">
      <span className="state__icon" aria-hidden="true">○</span>
      <div>
        <p className="state__title">{title}</p>
        {children && <div className="state__body">{children}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: DataLoadError; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon" aria-hidden="true">⚠</span>
      <div>
        <p className="state__title">エラー：{error.message}</p>
        {error.issues.length > 0 && (
          <ul className="state__issues">
            {error.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
        <div className="button-row">
          {onRetry && (
            <button type="button" className="btn" onClick={onRetry}>
              再読み込み
            </button>
          )}
          <Link className="btn btn--ghost" to="/settings">
            設定・データ管理へ
          </Link>
        </div>
      </div>
    </div>
  );
}
